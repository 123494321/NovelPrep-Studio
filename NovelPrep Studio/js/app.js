/**
 * NovelPrep Studio - Application Controller
 * Version: v1.1.0
 */

const APP_VERSION = 'v1.1.0';

document.addEventListener('DOMContentLoaded', () => {
    console.log(`%c🚀 NovelPrep Studio ${APP_VERSION} 가동 완료`, 'color: #6366f1; font-weight: bold; font-size: 14px;');

    // -------------------------------------------------------------
    // Core Instances & State
    // -------------------------------------------------------------
    const normalizer = new ManuscriptNormalizer();
    const epubExtractor = new EpubExtractor();

    const state = {
        tocItems: [],
        txtFile: null,       // { name, size, text, charCount, lineCount }
        normalizedFullText: '', // 전체 정규화 원고
        epubFile: null,      // File
        epubResult: null,    // { metadata, chapterCount, imageCount, extractedText, images }
        activeTab: 'tab-normalizer'
    };

    // -------------------------------------------------------------
    // DOM Element References
    // -------------------------------------------------------------
    // Header & Tabs
    const mainNavTabs = document.querySelectorAll('.nav-tab');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const btnOpenHelpModal = document.getElementById('btnOpenHelpModal');
    const helpModal = document.getElementById('helpModal');
    const btnCloseHelpModal = document.getElementById('btnCloseHelpModal');
    const btnConfirmHelpModal = document.getElementById('btnConfirmHelpModal');
    const btnShowBookmarkletHelp = document.getElementById('btnShowBookmarkletHelp');

    // Tab 1: TOC Controls
    const subTabs = document.querySelectorAll('.sub-tab');
    const subtabPanes = document.querySelectorAll('.subtab-pane');
    const inputNovelUrl = document.getElementById('inputNovelUrl');
    const btnFetchUrl = document.getElementById('btnFetchUrl');
    const inputTocText = document.getElementById('inputTocText');
    const btnApplyTocText = document.getElementById('btnApplyTocText');
    const btnClearTocText = document.getElementById('btnClearTocText');
    const inputHtmlSource = document.getElementById('inputHtmlSource');
    const btnParseHtmlSource = document.getElementById('btnParseHtmlSource');
    const tocItemsList = document.getElementById('tocItemsList');
    const tocCountBadge = document.getElementById('tocCountBadge');
    const btnClearAllToc = document.getElementById('btnClearAllToc');
    const btnReverseToc = document.getElementById('btnReverseToc');
    const checkExcludeNotices = document.getElementById('checkExcludeNotices');

    // Tab 1: Format Options
    const selectNumberFormat = document.getElementById('selectNumberFormat');
    const customFormatGroup = document.getElementById('customFormatGroup');
    const inputCustomFormat = document.getElementById('inputCustomFormat');
    const inputStartNumber = document.getElementById('inputStartNumber');
    const checkFlexSuffix = document.getElementById('checkFlexSuffix');
    const checkIgnoreSpaces = document.getElementById('checkIgnoreSpaces');

    // Tab 1: TXT Dropzone & Stats
    const txtDropzone = document.getElementById('txtDropzone');
    const inputTxtFile = document.getElementById('inputTxtFile');
    const fileInfoBadge = document.getElementById('fileInfoBadge');
    const fileStatsContainer = document.getElementById('fileStatsContainer');
    const statFileName = document.getElementById('statFileName');
    const statFileSize = document.getElementById('statFileSize');
    const statCharCount = document.getElementById('statCharCount');
    const statLineCount = document.getElementById('statLineCount');

    // Tab 1: Execution & Diagnostics
    const btnRunNormalization = document.getElementById('btnRunNormalization');
    const matchDiagnosticCard = document.getElementById('matchDiagnosticCard');
    const badgeSuccessCount = document.getElementById('badgeSuccessCount');
    const badgeMissingCount = document.getElementById('badgeMissingCount');
    const unmatchedAlert = document.getElementById('unmatchedAlert');
    const unmatchedList = document.getElementById('unmatchedList');
    const matchingLogList = document.getElementById('matchingLogList');

    // Tab 1: Result & Export
    const resultPreviewPanel = document.getElementById('resultPreviewPanel');
    const resultTextPreview = document.getElementById('resultTextPreview');
    const txtPreviewNoticeBadge = document.getElementById('txtPreviewNoticeBadge');
    const btnCopyResult = document.getElementById('btnCopyResult');
    const btnDownloadResult = document.getElementById('btnDownloadResult');

    // Tab 2: EPUB Elements
    const epubDropzone = document.getElementById('epubDropzone');
    const inputEpubFile = document.getElementById('inputEpubFile');
    const epubMetaCard = document.getElementById('epubMetaCard');
    const epubMetaTitle = document.getElementById('epubMetaTitle');
    const epubMetaCreator = document.getElementById('epubMetaCreator');
    const epubMetaChapters = document.getElementById('epubMetaChapters');
    const epubMetaImages = document.getElementById('epubMetaImages');
    const selectParagraphSpacing = document.getElementById('selectParagraphSpacing');
    const selectRubyMode = document.getElementById('selectRubyMode');
    const checkInsertChapterTitles = document.getElementById('checkInsertChapterTitles');
    const checkExtractImages = document.getElementById('checkExtractImages');
    const btnRunEpubExtraction = document.getElementById('btnRunEpubExtraction');

    // Tab 2: Result & Export
    const miniTabs = document.querySelectorAll('.mini-tab');
    const eprevPanes = document.querySelectorAll('.eprev-pane');
    const galleryCount = document.getElementById('galleryCount');
    const extractedCharsCount = document.getElementById('extractedCharsCount');
    const epubPreviewNoticeBadge = document.getElementById('epubPreviewNoticeBadge');
    const epubExtractedTextPreview = document.getElementById('epubExtractedTextPreview');
    const epubImagesGallery = document.getElementById('epubImagesGallery');
    const btnCopyEpubTxt = document.getElementById('btnCopyEpubTxt');
    const btnDownloadEpubTxt = document.getElementById('btnDownloadEpubTxt');
    const btnDownloadEpubImages = document.getElementById('btnDownloadEpubImages');
    const btnDownloadEpubAllZip = document.getElementById('btnDownloadEpubAllZip');

    // -------------------------------------------------------------
    // Main Navigation Tabs Switching
    // -------------------------------------------------------------
    mainNavTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab;
            mainNavTabs.forEach(t => t.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const targetPane = document.getElementById(targetId);
            if (targetPane) targetPane.classList.add('active');
            state.activeTab = targetId;
            window.location.hash = targetId;
        });
    });

    // Check URL Hash on page load
    if (window.location.hash === '#tab-epub-extractor') {
        const epubTab = document.querySelector('.nav-tab[data-tab="tab-epub-extractor"]');
        if (epubTab) epubTab.click();
    }

    // Version Loaded Toast
    setTimeout(() => {
        showToast(`NovelPrep Studio ${APP_VERSION}이(가) 성공적으로 로드되었습니다.`, 'info');
    }, 300);

    // -------------------------------------------------------------
    // TOC Sub-tabs Switching
    // -------------------------------------------------------------
    subTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.subtab;
            subTabs.forEach(t => t.classList.remove('active'));
            subtabPanes.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const targetPane = document.getElementById(targetId);
            if (targetPane) targetPane.classList.add('active');
        });
    });

    // -------------------------------------------------------------
    // TOC Format Preset Selection
    // -------------------------------------------------------------
    selectNumberFormat.addEventListener('change', () => {
        if (selectNumberFormat.value === 'custom') {
            customFormatGroup.classList.remove('hidden');
            inputCustomFormat.focus();
        } else {
            customFormatGroup.classList.add('hidden');
        }
    });

    // -------------------------------------------------------------
    // TOC Management Functions
    // -------------------------------------------------------------
    function updateTocList(newItems, append = false) {
        if (append) {
            state.tocItems = [...state.tocItems, ...newItems];
        } else {
            state.tocItems = [...newItems];
        }
        renderTocList();
        checkReadyToNormalize();
    }

    function renderTocList() {
        tocCountBadge.textContent = `${state.tocItems.length}개 등록됨`;

        if (state.tocItems.length === 0) {
            tocItemsList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-inbox text-muted"></i>
                    <p>등록된 소제목이 없습니다.<br>위에서 링크나 텍스트로 목차를 등록해 주세요.</p>
                </div>
            `;
            return;
        }

        tocItemsList.innerHTML = '';
        state.tocItems.forEach((title, idx) => {
            const chip = document.createElement('div');
            chip.className = 'toc-item-chip';
            chip.innerHTML = `
                <span class="toc-item-idx">#${idx + 1}</span>
                <span class="toc-item-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
                <button class="btn-remove-toc" data-index="${idx}" title="삭제">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
            tocItemsList.appendChild(chip);
        });

        // Delete button listener
        tocItemsList.querySelectorAll('.btn-remove-toc').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.dataset.index, 10);
                state.tocItems.splice(idx, 1);
                renderTocList();
                checkReadyToNormalize();
            });
        });
    }

    // 1) Link URL Fetch
    btnFetchUrl.addEventListener('click', async () => {
        const url = inputNovelUrl.value.trim();
        if (!url) {
            showToast('소설 연재 페이지 링크를 입력해 주세요.', 'warning');
            inputNovelUrl.focus();
            return;
        }

        const originalBtnContent = btnFetchUrl.innerHTML;
        btnFetchUrl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 수집 중...';
        btnFetchUrl.disabled = true;

        try {
            showToast('목차 웹 페이지를 분석하는 중입니다...', 'info');
            const html = await UrlTocFetcher.fetchHtml(url);
            const parsed = UrlTocFetcher.parseTocFromHtml(html);

            if (parsed.length === 0) {
                showToast('페이지에서 목차를 자동으로 식별하지 못했습니다. HTML 소스 파싱 탭을 이용해 주세요.', 'warning');
            } else {
                updateTocList(parsed, false);
                showToast(`${parsed.length}개의 소제목을 성공적으로 수집했습니다!`, 'success');
            }
        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            btnFetchUrl.innerHTML = originalBtnContent;
            btnFetchUrl.disabled = false;
        }
    });

    // 2) Direct Text Apply
    btnApplyTocText.addEventListener('click', () => {
        const text = inputTocText.value.trim();
        if (!text) {
            showToast('입력된 소제목이 없습니다.', 'warning');
            return;
        }
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        updateTocList(lines, false);
        showToast(`${lines.length}개의 소제목이 등록되었습니다.`, 'success');
    });

    btnClearTocText.addEventListener('click', () => {
        inputTocText.value = '';
    });

    // 3) HTML Source Parsing
    btnParseHtmlSource.addEventListener('click', () => {
        const html = inputHtmlSource.value.trim();
        if (!html) {
            showToast('HTML 소스를 붙여넣어 주세요.', 'warning');
            return;
        }
        const excludeNotices = checkExcludeNotices.checked;
        const parsed = UrlTocFetcher.parseTocFromHtml(html, { excludeNotices });
        if (parsed.length === 0) {
            showToast('붙여넣은 HTML에서 목차 소제목을 찾지 못했습니다.', 'warning');
        } else {
            updateTocList(parsed, false);
            showToast(`${parsed.length}개의 소제목을 성공적으로 추출하여 등록했습니다!`, 'success');
        }
    });

    // Reverse TOC Order
    btnReverseToc.addEventListener('click', () => {
        if (state.tocItems.length < 2) {
            showToast('뒤집을 소제목이 2개 이상 있어야 합니다.', 'warning');
            return;
        }
        state.tocItems.reverse();
        renderTocList();
        showToast('소제목 목록 순서를 반대로 뒤집었습니다. (첫화 ⇋ 최신화)', 'info');
    });

    // Clear All TOC
    btnClearAllToc.addEventListener('click', () => {
        if (state.tocItems.length === 0) return;
        state.tocItems = [];
        renderTocList();
        checkReadyToNormalize();
        showToast('목차 목록을 모두 비웠습니다.', 'info');
    });

    // -------------------------------------------------------------
    // TXT File Loading & Decoding (Auto-detect UTF-8 / CP949)
    // -------------------------------------------------------------
    txtDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        txtDropzone.classList.add('dragover');
    });

    txtDropzone.addEventListener('dragleave', () => {
        txtDropzone.classList.remove('dragover');
    });

    txtDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        txtDropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleTxtFile(e.dataTransfer.files[0]);
        }
    });

    inputTxtFile.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleTxtFile(e.target.files[0]);
        }
    });

    async function handleTxtFile(file) {
        if (!file.name.toLowerCase().endsWith('.txt')) {
            showToast('텍스트 파일(.txt)만 업로드할 수 있습니다.', 'danger');
            return;
        }

        try {
            const buffer = await file.arrayBuffer();
            let text = '';
            
            // 1차: UTF-8 시도
            try {
                const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                text = utf8Decoder.decode(buffer);
            } catch (e) {
                // UTF-8 디코딩 실패 시 CP949 (EUC-KR) 디코딩
                const cp949Decoder = new TextDecoder('euc-kr');
                text = cp949Decoder.decode(buffer);
            }

            const lines = text.split(/\r?\n/).length;
            const chars = text.length;

            state.txtFile = {
                name: file.name,
                size: formatFileSize(file.size),
                rawSize: file.size,
                text: text,
                charCount: chars,
                lineCount: lines
            };

            // Update UI
            fileInfoBadge.className = 'badge badge-success';
            fileInfoBadge.textContent = '원고 로드 완료';

            fileStatsContainer.classList.remove('hidden');
            statFileName.textContent = state.txtFile.name;
            statFileSize.textContent = state.txtFile.size;
            statCharCount.textContent = `${chars.toLocaleString()} 자`;
            statLineCount.textContent = `${lines.toLocaleString()} 줄`;

            showToast(`"${file.name}" 원고 파일을 성공적으로 불러왔습니다.`, 'success');
            checkReadyToNormalize();
        } catch (err) {
            showToast(`파일 읽기 실패: ${err.message}`, 'danger');
        }
    }

    function checkReadyToNormalize() {
        const isReady = (state.txtFile !== null && state.txtFile.text.length > 0) && (state.tocItems.length > 0);
        btnRunNormalization.disabled = !isReady;
    }

    // -------------------------------------------------------------
    // Execute Normalization (Sequential Forward Search)
    // -------------------------------------------------------------
    btnRunNormalization.addEventListener('click', () => {
        if (!state.txtFile || !state.txtFile.text) {
            showToast('먼저 소설 원고(.txt)를 업로드해 주세요.', 'warning');
            return;
        }

        if (state.tocItems.length === 0) {
            showToast('먼저 소제목(목차) 목록을 등록해 주세요.', 'warning');
            return;
        }

        // Get Options
        let formatTemplate = selectNumberFormat.value;
        if (formatTemplate === 'custom') {
            formatTemplate = inputCustomFormat.value.trim() || '[{n}화]. {title}';
        }
        const startNumber = parseInt(inputStartNumber.value, 10) || 1;
        const flexSuffix = checkFlexSuffix.checked;
        const ignoreSpaces = checkIgnoreSpaces.checked;

        try {
            normalizer.setTocList(state.tocItems);
            normalizer.setRawText(state.txtFile.text);

            const result = normalizer.execute({
                formatTemplate,
                startNumber,
                flexSuffix,
                ignoreSpaces
            });

            // Store Full Text
            state.normalizedFullText = result.normalizedText;

            // Render Diagnostics
            renderDiagnostics(result.diagnostics);

            // Render Smart 100-line Preview (Protect browser from freezing)
            const lines = result.normalizedText.split(/\r?\n/);
            if (lines.length > 100) {
                resultTextPreview.value = lines.slice(0, 100).join('\n') + `\n\n============================================================\n[안내] 브라우저 성능 보호를 위해 앞부분 100줄만 미리 표시됩니다.\n(총 ${lines.length.toLocaleString()}줄 / ${result.normalizedText.length.toLocaleString()}자 전체 원고는 [완성 원고 다운로드] 버튼을 이용하세요)\n============================================================`;
                txtPreviewNoticeBadge.classList.remove('hidden');
            } else {
                resultTextPreview.value = result.normalizedText;
                txtPreviewNoticeBadge.classList.add('hidden');
            }

            resultPreviewPanel.classList.remove('hidden');
            resultPreviewPanel.scrollIntoView({ behavior: 'smooth' });

            showToast(`회차 번호 주입 완료! (매칭: ${result.diagnostics.successCount}건 / 미발견: ${result.diagnostics.missingCount}건)`, 'success');
        } catch (err) {
            showToast(`정규화 오류: ${err.message}`, 'danger');
        }
    });

    function renderDiagnostics(diag) {
        matchDiagnosticCard.classList.remove('hidden');
        badgeSuccessCount.textContent = `매칭 성공 ${diag.successCount}개`;
        badgeMissingCount.textContent = `미발견 ${diag.missingCount}개`;

        // Unmatched Alert
        if (diag.missingCount > 0) {
            unmatchedAlert.classList.remove('hidden');
            unmatchedList.innerHTML = diag.unmatched.map(u => 
                `<li><strong>[${u.expectedEpisodeNum}화 예정]</strong> ${escapeHtml(u.title)}</li>`
            ).join('');
        } else {
            unmatchedAlert.classList.add('hidden');
        }

        // Sequential Matching Log
        matchingLogList.innerHTML = diag.matches.map(m => `
            <div class="log-item success">
                <span><i class="fa-solid fa-check"></i> [${m.episodeNum}화] ${escapeHtml(m.title)}</span>
                <span class="text-muted">줄: ${m.line} (위치: ${m.startIndex.toLocaleString()}자)</span>
            </div>
        `).join('');

        if (diag.missingCount > 0) {
            diag.unmatched.forEach(u => {
                const item = document.createElement('div');
                item.className = 'log-item missing';
                item.innerHTML = `
                    <span><i class="fa-solid fa-xmark"></i> [미발견] ${escapeHtml(u.title)}</span>
                    <span class="text-danger">본문 불일치</span>
                `;
                matchingLogList.appendChild(item);
            });
        }
    }

    // -------------------------------------------------------------
    // Copy & Download Result TXT (Full 100% Text)
    // -------------------------------------------------------------
    btnCopyResult.addEventListener('click', async () => {
        const fullText = state.normalizedFullText || resultTextPreview.value;
        if (!fullText) return;
        try {
            await navigator.clipboard.writeText(fullText);
            showToast('전체 원고(100%)가 클립보드에 복사되었습니다!', 'success');
        } catch (e) {
            resultTextPreview.select();
            document.execCommand('copy');
            showToast('클립보드에 복사되었습니다.', 'success');
        }
    });

    btnDownloadResult.addEventListener('click', () => {
        const fullText = state.normalizedFullText || resultTextPreview.value;
        if (!fullText) return;
        const origName = state.txtFile ? state.txtFile.name.replace(/\.txt$/i, '') : '원고';
        const downloadName = `[정규화]_${origName}.txt`;
        downloadBlob(new Blob([fullText], { type: 'text/plain;charset=utf-8' }), downloadName);
        showToast(`"${downloadName}" 다운로드가 시작되었습니다.`, 'success');
    });

    // -------------------------------------------------------------
    // TAB 2: EPUB Extractor Handlers
    // -------------------------------------------------------------
    epubDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        epubDropzone.classList.add('dragover');
    });

    epubDropzone.addEventListener('dragleave', () => {
        epubDropzone.classList.remove('dragover');
    });

    epubDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        epubDropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleEpubFile(e.dataTransfer.files[0]);
        }
    });

    inputEpubFile.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleEpubFile(e.target.files[0]);
        }
    });

    function handleEpubFile(file) {
        if (!file.name.toLowerCase().endsWith('.epub')) {
            showToast('EPUB 파일(.epub)만 업로드할 수 있습니다.', 'danger');
            return;
        }

        state.epubFile = file;
        btnRunEpubExtraction.disabled = false;
        showToast(`"${file.name}" 전자책이 선택되었습니다. [역변환 실행]을 클릭하세요.`, 'info');
    }

    btnRunEpubExtraction.addEventListener('click', async () => {
        if (!state.epubFile) return;

        const originalBtnContent = btnRunEpubExtraction.innerHTML;
        btnRunEpubExtraction.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 정제 및 추출 중...';
        btnRunEpubExtraction.disabled = true;

        try {
            const options = {
                paragraphSpacing: selectParagraphSpacing.value,
                rubyMode: selectRubyMode.value,
                insertChapterTitles: checkInsertChapterTitles.checked,
                extractImages: checkExtractImages.checked
            };

            const result = await epubExtractor.loadEpub(state.epubFile, options);
            state.epubResult = result;

            // Render Metadata
            epubMetaCard.classList.remove('hidden');
            epubMetaTitle.textContent = result.metadata.title;
            epubMetaCreator.textContent = result.metadata.creator;
            epubMetaChapters.textContent = `${result.chapterCount}개 챕터`;
            epubMetaImages.textContent = `${result.imageCount}장 이미지`;

            // Render Extracted Text (Smart 100-line preview)
            epubExtractedTextPreview.value = result.previewText;
            extractedCharsCount.textContent = `총 ${result.extractedText.length.toLocaleString()} 자 추출됨`;
            
            const linesCount = result.extractedText.split('\n').length;
            if (linesCount > 100) {
                epubPreviewNoticeBadge.classList.remove('hidden');
            } else {
                epubPreviewNoticeBadge.classList.add('hidden');
            }

            btnCopyEpubTxt.disabled = false;
            btnDownloadEpubTxt.disabled = false;

            // Render Images Gallery
            galleryCount.textContent = result.imageCount;
            renderImageGallery(result.images);
            btnDownloadEpubImages.disabled = (result.imageCount === 0);
            btnDownloadEpubAllZip.disabled = false;

            showToast('구형 EPUB 역변환이 완료되었습니다!', 'success');
        } catch (err) {
            showToast(`EPUB 역변환 실패: ${err.message}`, 'danger');
        } finally {
            btnRunEpubExtraction.innerHTML = originalBtnContent;
            btnRunEpubExtraction.disabled = false;
        }
    });

    function renderImageGallery(images) {
        if (!images || images.length === 0) {
            epubImagesGallery.innerHTML = `
                <div class="empty-state">
                    <i class="fa-regular fa-images text-muted"></i>
                    <p>추출된 이미지가 없습니다.</p>
                </div>
            `;
            return;
        }

        epubImagesGallery.innerHTML = images.map((img, idx) => `
            <div class="gallery-item">
                <div class="gallery-img-wrapper">
                    <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" loading="lazy">
                </div>
                <div class="gallery-item-name" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</div>
            </div>
        `).join('');
    }

    // Mini Tabs (Text vs Images preview)
    miniTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = `eprev-${tab.dataset.eprev}`;
            miniTabs.forEach(t => t.classList.remove('active'));
            eprevPanes.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const pane = document.getElementById(targetId);
            if (pane) pane.classList.add('active');
        });
    });

    // EPUB Copy & Downloads (Full 100% Text)
    btnCopyEpubTxt.addEventListener('click', async () => {
        const fullText = state.epubResult?.extractedText || epubExtractedTextPreview.value;
        if (!fullText) return;
        try {
            await navigator.clipboard.writeText(fullText);
            showToast('전체 순수 텍스트 원고(100%)가 복사되었습니다.', 'success');
        } catch (e) {
            epubExtractedTextPreview.select();
            document.execCommand('copy');
            showToast('복사되었습니다.', 'success');
        }
    });

    btnDownloadEpubTxt.addEventListener('click', () => {
        const fullText = state.epubResult?.extractedText || epubExtractedTextPreview.value;
        if (!fullText) return;
        const title = (state.epubResult?.metadata?.title || '추출원고').replace(/[\\/:*?"<>|]/g, '_');
        const filename = `${title}.txt`;
        downloadBlob(new Blob([fullText], { type: 'text/plain;charset=utf-8' }), filename);
        showToast(`"${filename}" 다운로드가 시작되었습니다.`, 'success');
    });

    btnDownloadEpubImages.addEventListener('click', async () => {
        try {
            const zipBlob = await epubExtractor.generateImagesZip();
            const title = (state.epubResult?.metadata?.title || '삽화이미지').replace(/[\\/:*?"<>|]/g, '_');
            const filename = `[이미지]_${title}.zip`;
            downloadBlob(zipBlob, filename);
            showToast(`"${filename}" 다운로드가 시작되었습니다.`, 'success');
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });

    btnDownloadEpubAllZip.addEventListener('click', async () => {
        try {
            const zipBlob = await epubExtractor.generatePackageZip();
            const title = (state.epubResult?.metadata?.title || '완성패키지').replace(/[\\/:*?"<>|]/g, '_');
            const filename = `[전체패키지]_${title}.zip`;
            downloadBlob(zipBlob, filename);
            showToast(`"${filename}" 통합 패키지 다운로드가 시작되었습니다.`, 'success');
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });

    // -------------------------------------------------------------
    // Help Modal & Bookmarklet Guide
    // -------------------------------------------------------------
    function openHelpModal() {
        helpModal.classList.remove('hidden');
    }
    function closeHelpModal() {
        helpModal.classList.add('hidden');
    }

    btnOpenHelpModal.addEventListener('click', openHelpModal);
    btnShowBookmarkletHelp.addEventListener('click', openHelpModal);
    btnCloseHelpModal.addEventListener('click', closeHelpModal);
    btnConfirmHelpModal.addEventListener('click', closeHelpModal);

    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) closeHelpModal();
    });

    // -------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = 'fa-circle-info';
        if (type === 'success') icon = 'fa-circle-check';
        if (type === 'warning') icon = 'fa-triangle-exclamation';
        if (type === 'danger') icon = 'fa-circle-xmark';

        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});
