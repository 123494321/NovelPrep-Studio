/**
 * NovelPrep Studio - 목차 URL 수집 및 HTML 파서 유틸리티
 */

class UrlTocFetcher {
    /**
     * URL로부터 HTML 텍스트를 수집 (CORS 프록시 자동 폴백)
     * @param {string} url 
     * @returns {Promise<string>}
     */
    static async fetchHtml(url) {
        if (!url || !url.startsWith('http')) {
            throw new Error('올바른 웹 페이지 주소(http:// 또는 https://)를 입력해 주세요.');
        }

        // 1차 시도: 직접 호출 (CORS 허용된 사이트)
        try {
            const res = await fetch(url, { mode: 'cors' });
            if (res.ok) {
                return await res.text();
            }
        } catch (e) {
            // 직접 연결 실패 시 CORS 프록시로 폴백 진행
            console.warn('직접 연결 실패, CORS 프록시로 시도합니다:', e.message);
        }

        // 2차 시도: allorigins 프록시
        try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const res = await fetch(proxyUrl);
            if (res.ok) {
                return await res.text();
            }
        } catch (e) {
            console.warn('1차 프록시 실패:', e.message);
        }

        // 3차 시도: corsproxy.io
        try {
            const proxyUrl2 = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            const res = await fetch(proxyUrl2);
            if (res.ok) {
                return await res.text();
            }
        } catch (e) {
            console.warn('2차 프록시 실패:', e.message);
        }

        throw new Error('웹 브라우저의 보안 정책(CORS)으로 인해 링크를 직접 가져오지 못했습니다. 상단의 [HTML 소스 파싱] 또는 [북마크릿]을 이용해 주세요.');
    }

    /**
     * HTML 문서 텍스트에서 소제목(목차) 목록 추출
     * @param {string} htmlText 
     * @returns {string[]}
     */
    static parseTocFromHtml(htmlText) {
        if (!htmlText) return [];

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        // 연재 사이트에서 흔히 쓰이는 소제목 셀렉터 우선순위 리스트
        const candidateSelectors = [
            // 문피아, 조아라, 노벨피아 등 전형적 연재 목록
            '.episode_title',
            '.episode-title',
            '.episode_item .title',
            '.ep_title',
            '.sub_title',
            'td.subject a',
            'td.title a',
            '.list_item .title',
            '.chapter_title',
            '.chapter-list a',
            'ul.list_episode li a',
            'div[class*="episode"] a',
            'div[class*="chapter"] a',
            'li[class*="episode"]',
            'li[class*="chapter"]',
            'a[class*="title"]',
            '.item-title'
        ];

        let foundTitles = [];

        // 1. 구체적인 클래스/셀렉터 탐색
        for (const selector of candidateSelectors) {
            const els = doc.querySelectorAll(selector);
            if (els.length >= 3) { // 최소 3개 이상의 항목이 매칭될 때 목차 목록으로 신뢰
                foundTitles = Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
                break;
            }
        }

        // 2. 만약 특정 클래스로 찾지 못했다면 링크(a 태그) 중 목차 패턴 탐색
        if (foundTitles.length === 0) {
            const allLinks = Array.from(doc.querySelectorAll('a'));
            const linkTexts = allLinks
                .map(a => a.textContent.trim())
                .filter(t => t.length > 1 && t.length < 100);

            // "n화", "제n장", "프롤로그" 등의 패턴을 포함하는 링크 그룹 탐색
            const episodePattern = /(?:제\s*\d+\s*[화장]|^\d+[화장\.]|프롤로그|에필로그|외전)/;
            const episodeLinks = linkTexts.filter(t => episodePattern.test(t));

            if (episodeLinks.length >= 2) {
                foundTitles = episodeLinks;
            } else if (linkTexts.length > 5) {
                // 부모 태그가 ul/ol/tbody 이며 반복되는 항목 추출
                const listContainers = doc.querySelectorAll('ul, ol, tbody');
                for (const container of listContainers) {
                    const items = Array.from(container.querySelectorAll('a, li, tr td:first-child'))
                        .map(el => el.textContent.trim())
                        .filter(t => t.length > 1 && t.length < 80);
                    
                    if (items.length >= 5) {
                        foundTitles = items;
                        break;
                    }
                }
            }
        }

        // 3. 정제: 줄바꿈 제거, 중복 제거, 비목차 텍스트 필터링
        const noiseWords = ['로그인', '회원가입', '공지사항', '이벤트', '댓글', '추천', '선작', '마이페이지', 'TOP', '목차'];
        
        const cleaned = foundTitles
            .map(t => t.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim())
            .filter(t => {
                if (t.length < 1 || t.length > 120) return false;
                if (noiseWords.some(w => t === w)) return false;
                return true;
            });

        // 연속 중복 항목만 제거 (다른 화에 동일 제목이 있을 수 있으므로 인접 중복만 제거)
        const deduped = [];
        for (let i = 0; i < cleaned.length; i++) {
            if (i === 0 || cleaned[i] !== cleaned[i - 1]) {
                deduped.push(cleaned[i]);
            }
        }

        return deduped;
    }
}

// 전역 등록
if (typeof window !== 'undefined') {
    window.UrlTocFetcher = UrlTocFetcher;
}
