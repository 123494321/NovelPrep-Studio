/**
 * NovelPrep Studio - 구형 EPUB ➔ 순수 TXT 고품질 역변환기
 * 
 * [핵심 기능]
 * 1. 비표준/구형 EPUB 완벽 분해 (container.xml ➔ OPF ➔ Spine 순서 파싱)
 * 2. 난잡한 비표준 HTML 태그, 인라인 스타일, 엔티티를 정제하여 순수 문단 호흡 복원
 * 3. 표지 및 삽화 이미지 원본 파일 그대로 일괄 분리 추출
 * 4. 순수 TXT 및 이미지 ZIP 패키징 다운로드 지원
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
    }

    /**
     * ArrayBuffer 또는 File 객체를 받아 EPUB 파싱 시작
     * @param {File|ArrayBuffer} fileOrBuffer 
     * @param {object} options 
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

        // 1. META-INF/container.xml 파싱하여 OPF 경로 획득
        const opfPath = await this.getOpfPath();
        if (!opfPath) {
            throw new Error('EPUB 표준 구조(container.xml)를 찾을 수 없습니다.');
        }

        // OPF 파일의 기본 디렉터리 경로 계산
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

        // 4. Manifest 파싱 (id -> { href, mediaType, fullPath })
        const manifestMap = this.parseManifest(opfDoc, opfDir);

        // 5. Spine 순서 파싱
        const spineItems = this.parseSpine(opfDoc, manifestMap);

        // 6. 이미지 파일 추출
        if (options.extractImages !== false) {
            await this.extractImages(manifestMap);
        }

        // 7. 각 챕터 HTML 파일 텍스트 정제 및 결합
        await this.extractChaptersText(spineItems, options);

        return {
            metadata: this.metadata,
            chapterCount: this.chapters.length,
            imageCount: this.images.length,
            extractedText: this.extractedText,
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

            if (id && href) {
                // 상대경로 결합 및 URL 디코딩
                let fullPath = opfDir + href;
                // 경로 정규화 (예: OEBPS/../Text/ch1.xhtml)
                fullPath = this.resolvePath(fullPath);

                manifestMap.set(id, {
                    id,
                    href,
                    mediaType,
                    fullPath
                });
            }
        });

        return manifestMap;
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
            paragraphSpacing = 'standard', // 'standard' (빈 줄 1개), 'single' (엔터 1개), 'raw'
            handleRuby = true
        } = options;

        for (let i = 0; i < spineItems.length; i++) {
            const item = spineItems[i];
            const zipEntry = this.zip.file(item.fullPath) || this.zip.file(decodeURIComponent(item.fullPath));

            if (!zipEntry) continue;

            const htmlContent = await zipEntry.async('text');
            const cleanText = this.cleanHtmlToText(htmlContent, {
                paragraphSpacing,
                handleRuby
            });

            if (cleanText.trim().length > 0) {
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
        const { paragraphSpacing = 'standard', handleRuby = true } = options;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 1. 스크립트, 스타일, 헤드 등 불필요 엘리먼트 제거
        const uselessEls = doc.querySelectorAll('script, style, link, meta, head');
        uselessEls.forEach(el => el.remove());

        // 2. 루비 태그(<ruby>) 처리: 한자[독음] 형태로 정돈
        if (handleRuby) {
            const rubyEls = doc.querySelectorAll('ruby');
            rubyEls.forEach(ruby => {
                const rt = ruby.querySelector('rt');
                const baseText = Array.from(ruby.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE || (n.nodeName !== 'RT' && n.nodeName !== 'RP'))
                    .map(n => n.textContent)
                    .join('').trim();
                
                if (rt && rt.textContent.trim()) {
                    ruby.replaceWith(document.createTextNode(`${baseText}(${rt.textContent.trim()})`));
                } else if (baseText) {
                    ruby.replaceWith(document.createTextNode(baseText));
                }
            });
        }

        // 3. 문단 구분자 처리: <p>, <div>, <h1>~<h6>, <li>, <br>
        const body = doc.body || doc.documentElement;
        if (!body) return '';

        // 줄바꿈 마커를 삽입하여 문단 호흡 유지
        // <br> 태그는 단일 줄바꿈으로
        const brs = body.querySelectorAll('br');
        brs.forEach(br => br.replaceWith(document.createTextNode('\n')));

        // 블록 레벨 엘리먼트 앞뒤로 마커 개행 삽입
        const blockEls = body.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, tr');
        blockEls.forEach(block => {
            block.prepend(document.createTextNode('\n'));
            block.append(document.createTextNode('\n'));
        });

        // 4. 텍스트 추출
        let rawExtracted = body.textContent || '';

        // 5. HTML 엔티티 및 특수공백 디코딩
        rawExtracted = this.decodeHtmlEntities(rawExtracted);

        // 6. 문단 호흡 및 줄바꿈 정제
        let lines = rawExtracted.split(/\r?\n/).map(line => line.trim());

        if (paragraphSpacing === 'standard') {
            // 표준 웹소설/도서 호흡: 연속된 빈 줄을 최대 1개(엔터 2번)로 정돈
            let formatted = [];
            let lastWasEmpty = true;

            for (const line of lines) {
                if (line.length === 0) {
                    if (!lastWasEmpty) {
                        formatted.push('');
                        lastWasEmpty = true;
                    }
                } else {
                    formatted.push(line);
                    lastWasEmpty = false;
                }
            }
            return formatted.join('\n').trim();
        } else if (paragraphSpacing === 'single') {
            // 빈 줄 없이 연속 줄바꿈
            return lines.filter(line => line.length > 0).join('\n').trim();
        } else {
            // raw: 원본 라인 유지
            return lines.join('\n').trim();
        }
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
        // Non-breaking space 및 전각 공백 처리
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
        
        // 1. TXT 원고 추가
        const txtFileName = `${this.metadata.title || '원고'}.txt`;
        zip.file(txtFileName, this.extractedText);

        // 2. 이미지 폴더 추가
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
