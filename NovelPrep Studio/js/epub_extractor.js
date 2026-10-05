/**
 * NovelPrep Studio - 구형 EPUB ➔ 순수 TXT 고품질 역변환기
 * 
 * [개선된 핵심 기능]
 * 1. 비표준/구형 EPUB 완벽 분해 (container.xml ➔ OPF ➔ Spine ➔ TOC 매핑)
 * 2. 루비 태그(<ruby>) 원문 100% 보존 모드:
 *    - 'baseOnly' (기본): 독음 태그를 제거하고 작가의 원문 본문 글자만 완벽 보존
 *    - 'bracket': 독음을 괄호로 병기 (한자(독음))
 *    - 'raw': 단순 태그 제거
 * 3. TOC 목차명 기반 챕터 소제목 자동 보완 (본문에 제목이 소실된 챕터 복구)
 * 4. 스마트 미리보기(100줄 슬라이스)를 통한 대용량 원고 브라우저 프리징 0% 보장
 */

class EpubExtractor {
    constructor() {
        this.zip = null;
        this.metadata = {
            title: '무제',
            creator: '작자 미상',
            language: 'ko'
        };
        this.chapters = [];
        this.images = [];
        this.extractedText = '';
        this.tocMap = new Map(); // normalized href -> title
    }

    /**
     * ArrayBuffer 또는 File 객체를 받아 EPUB 파싱 시작
     */
    async loadEpub(fileOrBuffer, options = {}) {
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip 라이브러리가 로드되지 않았습니다.');
        }

        this.zip = await JSZip.loadAsync(fileOrBuffer);
        this.metadata = { title: '무제', creator: '작자 미상', language: 'ko' };
        this.chapters = [];
        this.images = [];
        this.extractedText = '';
        this.tocMap = new Map();

        // 1. META-INF/container.xml 파싱하여 OPF 경로 획득
        const opfPath = await this.getOpfPath();
        if (!opfPath) {
            throw new Error('EPUB 표준 구조(container.xml)를 찾을 수 없습니다.');
        }

        const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

        // 2. OPF 파일 내용 읽기
        const opfFile = this.zip.file(opfPath);
        if (!opfFile) {
            throw new Error(`OPF 파일(${opfPath})을 읽을 수 없습니다.`);
        }
        const opfXmlText = await opfFile.async('text');
        const parser = new DOMParser();
        const opfDoc = parser.parseFromString(opfXmlText, 'application/xml');

        // 3. 메타데이터 파싱
        this.parseMetadata(opfDoc);

        // 4. Manifest 파싱
        const manifestMap = this.parseManifest(opfDoc, opfDir);

        // 5. TOC 목차 파일(ncx / nav) 파싱하여 챕터명 매핑 구축
        await this.parseTocFile(opfDoc, manifestMap);

        // 6. Spine 순서 파싱
        const spineItems = this.parseSpine(opfDoc, manifestMap);

        // 7. 이미지 파일 추출
        if (options.extractImages !== false) {
            await this.extractImages(manifestMap);
        }

        // 8. 각 챕터 HTML 파일 텍스트 정제 및 결합
        await this.extractChaptersText(spineItems, options);

        return {
            metadata: this.metadata,
            chapterCount: this.chapters.length,
            imageCount: this.images.length,
            extractedText: this.extractedText,
            previewText: this.getPreviewText(100),
            images: this.images
        };
    }

    /**
     * container.xml 에서 rootfile full-path 가져오기
     */
    async getOpfPath() {
        const containerFile = this.zip.file('META-INF/container.xml');
        if (!containerFile) return null;

        const xmlText = await containerFile.async('text');
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'application/xml');
        const rootfile = doc.querySelector('rootfile');
        return rootfile ? rootfile.getAttribute('full-path') : null;
    }

    /**
     * OPF 메타데이터 추출
     */
    parseMetadata(opfDoc) {
        const titleEl = opfDoc.querySelector('metadata > title, metadata > *|title');
        if (titleEl && titleEl.textContent.trim()) {
            this.metadata.title = titleEl.textContent.trim();
        }

        const creatorEl = opfDoc.querySelector('metadata > creator, metadata > *|creator');
        if (creatorEl && creatorEl.textContent.trim()) {
            this.metadata.creator = creatorEl.textContent.trim();
        }

        const langEl = opfDoc.querySelector('metadata > language, metadata > *|language');
        if (langEl && langEl.textContent.trim()) {
            this.metadata.language = langEl.textContent.trim();
        }
    }

    /**
     * Manifest 항목 파싱
     */
    parseManifest(opfDoc, opfDir) {
        const manifestMap = new Map();
        const items = opfDoc.querySelectorAll('manifest > item');
        
        items.forEach(item => {
            const id = item.getAttribute('id');
            const href = item.getAttribute('href');
            const mediaType = item.getAttribute('media-type') || '';
            const properties = item.getAttribute('properties') || '';

            if (id && href) {
                let fullPath = opfDir + href;
                fullPath = this.resolvePath(fullPath);

                manifestMap.set(id, {
                    id,
                    href,
                    mediaType,
                    properties,
                    fullPath
                });
            }
        });

        return manifestMap;
    }

    /**
     * TOC 목차 파일(toc.ncx 또는 nav.xhtml) 파싱하여 파일별 챕터 제목 매핑
     */
    async parseTocFile(opfDoc, manifestMap) {
        this.tocMap = new Map();

        // 1. EPUB 2 ncx 파일 탐색
        let ncxItem = null;
        for (const [id, item] of manifestMap.entries()) {
            if (item.mediaType === 'application/x-dtbncx+xml' || id.toLowerCase().includes('ncx') || item.fullPath.toLowerCase().endsWith('.ncx')) {
                ncxItem = item;
                break;
            }
        }

        if (ncxItem) {
            const ncxFile = this.zip.file(ncxItem.fullPath);
            if (ncxFile) {
                const ncxText = await ncxFile.async('text');
                const parser = new DOMParser();
                const ncxDoc = parser.parseFromString(ncxText, 'application/xml');
                const navPoints = ncxDoc.querySelectorAll('navPoint');

                const ncxDir = ncxItem.fullPath.includes('/') ? ncxItem.fullPath.substring(0, ncxItem.fullPath.lastIndexOf('/') + 1) : '';

                navPoints.forEach(point => {
                    const textEl = point.querySelector('navLabel > text');
                    const contentEl = point.querySelector('content');
                    if (textEl && contentEl) {
                        const title = textEl.textContent.trim();
                        let src = contentEl.getAttribute('src') || '';
                        src = src.split('#')[0]; // 앵커 제거
                        let targetPath = this.resolvePath(ncxDir + src);
                        if (title && targetPath) {
                            this.tocMap.set(targetPath, title);
                        }
                    }
                });
            }
        }

        // 2. EPUB 3 nav 파일 탐색
        let navItem = null;
        for (const [id, item] of manifestMap.entries()) {
            if (item.properties.includes('nav') || id.toLowerCase().includes('nav') || item.fullPath.toLowerCase().includes('nav.')) {
                navItem = item;
                break;
            }
        }

        if (navItem && this.tocMap.size === 0) {
            const navFile = this.zip.file(navItem.fullPath);
            if (navFile) {
                const navText = await navFile.async('text');
                const parser = new DOMParser();
                const navDoc = parser.parseFromString(navText, 'text/html');
                const navLinks = navDoc.querySelectorAll('nav a, a');

                const navDir = navItem.fullPath.includes('/') ? navItem.fullPath.substring(0, navItem.fullPath.lastIndexOf('/') + 1) : '';

                navLinks.forEach(a => {
                    const title = a.textContent.trim();
                    let href = a.getAttribute('href') || '';
                    href = href.split('#')[0];
                    let targetPath = this.resolvePath(navDir + href);
                    if (title && targetPath && !this.tocMap.has(targetPath)) {
                        this.tocMap.set(targetPath, title);
                    }
                });
            }
        }
    }

    /**
     * Spine 읽기 순서 파싱
     */
    parseSpine(opfDoc, manifestMap) {
        const spineItems = [];
        const itemrefs = opfDoc.querySelectorAll('spine > itemref');

        itemrefs.forEach(itemref => {
            const idref = itemref.getAttribute('idref');
            if (idref && manifestMap.has(idref)) {
                spineItems.push(manifestMap.get(idref));
            }
        });

        return spineItems;
    }

    /**
     * 이미지 에셋 추출
     */
    async extractImages(manifestMap) {
        this.images = [];

        for (const [id, item] of manifestMap.entries()) {
            if (item.mediaType.startsWith('image/')) {
                const zipEntry = this.zip.file(item.fullPath) || this.zip.file(decodeURIComponent(item.fullPath));
                if (zipEntry) {
                    const blob = await zipEntry.async('blob');
                    const fileName = item.fullPath.split('/').pop() || `${id}.jpg`;
                    const dataUrl = await this.blobToDataUrl(blob);

                    this.images.push({
                        id,
                        name: fileName,
                        fullPath: item.fullPath,
                        mediaType: item.mediaType,
                        blob,
                        dataUrl,
                        size: blob.size
                    });
                }
            }
        }
    }

    /**
     * Spine에 정의된 챕터들의 본문 텍스트 정제 및 연결
     */
    async extractChaptersText(spineItems, options = {}) {
        const chapterTexts = [];
        const {
            paragraphSpacing = 'standard',
            rubyMode = 'baseOnly', // 'baseOnly' (기본: 본문만), 'bracket' (괄호병기), 'raw'
            insertChapterTitles = true
        } = options;

        for (let i = 0; i < spineItems.length; i++) {
            const item = spineItems[i];
            const zipEntry = this.zip.file(item.fullPath) || this.zip.file(decodeURIComponent(item.fullPath));

            if (!zipEntry) continue;

            const htmlContent = await zipEntry.async('text');
            let cleanText = this.cleanHtmlToText(htmlContent, {
                paragraphSpacing,
                rubyMode
            });

            if (cleanText.trim().length > 0) {
                // TOC 목차명으로 챕터 소제목 자동 보완
                if (insertChapterTitles && this.tocMap.has(item.fullPath)) {
                    const tocTitle = this.tocMap.get(item.fullPath);
                    // 본문 시작 첫 3줄 내에 이미 목차 제목이 있는지 확인 (대소문자/공백 무시)
                    const normalizedTocTitle = tocTitle.replace(/\s+/g, '');
                    const firstFewLines = cleanText.split('\n').slice(0, 3).join('').replace(/\s+/g, '');

                    if (!firstFewLines.includes(normalizedTocTitle)) {
                        // 제목이 본문 첫머리에 없으면 상단에 주입
                        cleanText = `${tocTitle}\n\n${cleanText}`;
                    }
                }

                this.chapters.push({
                    index: i + 1,
                    id: item.id,
                    path: item.fullPath,
                    text: cleanText
                });
                chapterTexts.push(cleanText);
            }
        }

        // 챕터 간 구분: 표준 2줄 빈 줄로 묶기
        this.extractedText = chapterTexts.join('\n\n\n');
    }

    /**
     * 비표준 HTML을 자연스럽고 깨끗한 순수 텍스트로 정제
     */
    cleanHtmlToText(html, options = {}) {
        const { paragraphSpacing = 'standard', rubyMode = 'baseOnly' } = options;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 1. 스크립트, 스타일, 헤드 등 불필요 엘리먼트 제거
        const uselessEls = doc.querySelectorAll('script, style, link, meta, head');
        uselessEls.forEach(el => el.remove());

        // 2. 루비 태그(<ruby>) 처리
        const rubyEls = doc.querySelectorAll('ruby');
        rubyEls.forEach(ruby => {
            const rt = ruby.querySelector('rt');
            const baseText = Array.from(ruby.childNodes)
                .filter(n => n.nodeType === Node.TEXT_NODE || (n.nodeName !== 'RT' && n.nodeName !== 'RP'))
                .map(n => n.textContent)
                .join('').trim();

            if (rubyMode === 'baseOnly') {
                // 작가 원문 글자만 보존 (독음 제거 - 원문 100% 보존)
                ruby.replaceWith(document.createTextNode(baseText));
            } else if (rubyMode === 'bracket') {
                // 괄호 병기 형태 (예: 魔法(매직))
                if (rt && rt.textContent.trim()) {
                    ruby.replaceWith(document.createTextNode(`${baseText}(${rt.textContent.trim()})`));
                } else if (baseText) {
                    ruby.replaceWith(document.createTextNode(baseText));
                }
            } else {
                // raw: 단순 텍스트 연결 (구형 방식: 魔法매직)
                const fullText = ruby.textContent || '';
                ruby.replaceWith(document.createTextNode(fullText));
            }
        });

        // 3. 줄바꿈 태그(<br>)를 줄바꿈 문자로 변환
        const body = doc.body || doc.documentElement;
        if (!body) return '';

        const brs = body.querySelectorAll('br');
        brs.forEach(br => br.replaceWith(document.createTextNode('\n')));

        // 4. 문단 블록 추출 (최하위 리프 블록 단위 분석)
        const blockSelectors = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, dt, dd, div, tr';
        const allBlocks = Array.from(body.querySelectorAll(blockSelectors));

        // 자식 블록을 포함하지 않는 순수 리프(Leaf) 블록만 선별 (부모 div와 자식 p 중복 추출 방지)
        const leafBlocks = allBlocks.filter(block => !block.querySelector(blockSelectors));

        let extractedParagraphs = [];

        if (leafBlocks.length === 0) {
            // 블록 태그가 없는 경우(예: body 내부에 직접 텍스트와 <br>만 있는 경우)
            const raw = this.decodeHtmlEntities(body.textContent || '');
            extractedParagraphs = raw.split(/\r?\n/).map(l => l.trim());
        } else {
            leafBlocks.forEach(block => {
                let t = this.decodeHtmlEntities(block.textContent || '');
                // 특수 공백 정규화
                t = t.replace(/\u00a0/g, ' ').replace(/\u3000/g, '  ');
                // 블록 내부에 있던 <br>이 \n으로 변환된 경우 분할
                const subLines = t.split(/\r?\n/).map(l => l.trim());
                subLines.forEach(line => {
                    extractedParagraphs.push(line);
                });
            });
        }

        // 5. 문단 호흡 및 줄바꿈 서식 적용
        if (paragraphSpacing === 'raw') {
            // 원본 태그 구조 그대로 유지:
            // 연속된 본문 문단은 단일 줄바꿈(\n)으로 이어지고,
            // 빈 문단(<p>&nbsp;</p>, <p></p> 등 의도된 장면 전환)만 빈 줄로 보존
            return extractedParagraphs.join('\n').trim();
        } else if (paragraphSpacing === 'standard') {
            // 웹소설 표준 줄바꿈: 문단마다 빈 줄 1줄 유지 (연속 빈 줄은 1줄로 압축)
            const formatted = [];
            let lastWasEmpty = true;

            for (const line of extractedParagraphs) {
                if (line.length === 0) {
                    if (!lastWasEmpty) {
                        formatted.push('');
                        lastWasEmpty = true;
                    }
                } else {
                    if (!lastWasEmpty) {
                        formatted.push('');
                    }
                    formatted.push(line);
                    lastWasEmpty = false;
                }
            }
            return formatted.join('\n').trim();
        } else if (paragraphSpacing === 'single') {
            // 단일 줄바꿈: 모든 빈 줄을 제거하고 엔터만 유지
            return extractedParagraphs.filter(l => l.length > 0).join('\n').trim();
        }

        return extractedParagraphs.join('\n').trim();
    }

    /**
     * 브라우저 렉 방지용 상위 100줄 미리보기 추출
     */
    getPreviewText(maxLines = 100) {
        if (!this.extractedText) return '';
        const lines = this.extractedText.split('\n');
        if (lines.length <= maxLines) {
            return this.extractedText;
        }
        const previewPart = lines.slice(0, maxLines).join('\n');
        const remainingLines = lines.length - maxLines;
        return `${previewPart}\n\n============================================================\n[안내] 브라우저 성능 보호를 위해 앞부분 100줄만 미리 표시됩니다.\n(총 ${lines.length.toLocaleString()}줄 / ${this.extractedText.length.toLocaleString()}자 전체 원고는 하단의 [순수 원고 다운로드] 버튼을 이용하세요)\n============================================================`;
    }

    /**
     * 경로 해결 (상대경로 '../' 처리)
     */
    resolvePath(path) {
        const parts = path.split('/');
        const stack = [];
        for (const p of parts) {
            if (p === '.' || p === '') continue;
            if (p === '..') {
                if (stack.length > 0) stack.pop();
            } else {
                stack.push(p);
            }
        }
        return stack.join('/');
    }

    /**
     * HTML 엔티티 디코딩
     */
    decodeHtmlEntities(str) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = str;
        let decoded = textarea.value;
        decoded = decoded.replace(/\u00a0/g, ' ').replace(/\u3000/g, '  ');
        return decoded;
    }

    /**
     * Blob ➔ DataURL 변환
     */
    blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * 추출된 이미지들을 모아 ZIP 파일 Blob으로 생성
     */
    async generateImagesZip() {
        if (!this.images || this.images.length === 0) {
            throw new Error('추출된 이미지가 없습니다.');
        }

        const zip = new JSZip();
        for (const img of this.images) {
            zip.file(img.name, img.blob);
        }

        return await zip.generateAsync({ type: 'blob' });
    }

    /**
     * TXT 원고와 이미지를 함께 포함하는 통합 패키지 ZIP 생성
     */
    async generatePackageZip() {
        const zip = new JSZip();
        
        const txtFileName = `${this.metadata.title || '원고'}.txt`;
        zip.file(txtFileName, this.extractedText);

        if (this.images.length > 0) {
            const imgFolder = zip.folder('images');
            for (const img of this.images) {
                imgFolder.file(img.name, img.blob);
            }
        }

        return await zip.generateAsync({ type: 'blob' });
    }
}

// 전역 등록
if (typeof window !== 'undefined') {
    window.EpubExtractor = EpubExtractor;
}
