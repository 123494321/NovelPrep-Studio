/**
 * NovelPrep Studio - 목차 URL 수집 및 플랫폼별 정밀 파서 엔진
 * 
 * [지원 플랫폼 정밀 분석]
 * 1. 노벨피아 (Novelpia):
 *    - table.notice_table, td[onclick*="/viewer/"] b, tr[class*="ep_style"] td.font12 b
 *    - 공지사항(일러스트, 휴재공지 등) 자동 식별
 * 2. 네이버 시리즈 (Naver Series):
 *    - a[class*="launchViewerForPreview"], ul.lst_thum li a, .volume_lst li a
 *    - <span>작품명</span> 제거 후 <strong>1화 / 회차명</strong>만 정밀 추출
 * 3. 문피아 (Munpia):
 *    - td.subject a, .episode_item .title, .list_episode li a
 * 4. 조아라, 카카오페이지 등 범용 웹소설 플랫폼
 */

class UrlTocFetcher {
    /**
     * URL을 기반으로 대상 플랫폼 식별
     * @param {string} url 
     * @returns {'novelpia'|'naver'|'munpia'|'generic'}
     */
    static detectPlatform(url) {
        if (!url) return 'generic';
        const lower = url.toLowerCase();
        if (lower.includes('novelpia.com')) return 'novelpia';
        if (lower.includes('series.naver.com') || lower.includes('naver.com')) return 'naver';
        if (lower.includes('munpia.com')) return 'munpia';
        if (lower.includes('joara.com')) return 'joara';
        if (lower.includes('kakaopage') || lower.includes('kakao.com')) return 'kakao';
        return 'generic';
    }

    /**
     * 다중 CORS 프록시 체인을 통한 HTML 수집
     * @param {string} url 
     * @returns {Promise<string>}
     */
    static async fetchHtml(url) {
        if (!url || !url.startsWith('http')) {
            throw new Error('올바른 웹 페이지 주소(http:// 또는 https://)를 입력해 주세요.');
        }

        // 1차 시도: 직접 Fetch (동일 오리진 or CORS 허용)
        try {
            const res = await fetch(url, { mode: 'cors' });
            if (res.ok) {
                const text = await res.text();
                if (text && text.length > 500) return text;
            }
        } catch (e) {
            console.warn('직접 호출 제한, 프록시 체인을 가동합니다:', e.message);
        }

        // 2차 시도: allorigins 프록시
        try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const res = await fetch(proxyUrl);
            if (res.ok) {
                const text = await res.text();
                if (text && text.length > 500) return text;
            }
        } catch (e) {
            console.warn('1차 프록시(allorigins) 우회 실패:', e.message);
        }

        // 3차 시도: corsproxy.io 프록시
        try {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            const res = await fetch(proxyUrl);
            if (res.ok) {
                const text = await res.text();
                if (text && text.length > 500) return text;
            }
        } catch (e) {
            console.warn('2차 프록시(corsproxy) 우회 실패:', e.message);
        }

        // 4차 시도: codetabs 프록시
        try {
            const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
            const res = await fetch(proxyUrl);
            if (res.ok) {
                const text = await res.text();
                if (text && text.length > 500) return text;
            }
        } catch (e) {
            console.warn('3차 프록시(codetabs) 우회 실패:', e.message);
        }

        throw new Error('사이트의 방화벽 또는 브라우저 CORS 정책으로 인해 링크 직접 수집이 차단되었습니다. 상단의 [HTML 소스 파싱] 탭 또는 [북마크릿]을 이용하시면 1초 만에 가져올 수 있습니다.');
    }

    /**
     * HTML 문서에서 플랫폼 자동 식별 및 소제목(목차) 목록 추출
     * @param {string} htmlText 
     * @param {object} options { excludeNotices: boolean, reverseOrder: boolean }
     * @returns {string[]}
     */
    static parseTocFromHtml(htmlText, options = {}) {
        if (!htmlText) return [];

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        let titles = [];

        // 1. 노벨피아 (Novelpia) 패턴 검사
        const isNovelpia = doc.querySelector('.notice_table, #episode_list_box, td[onclick*="/viewer/"]');
        if (isNovelpia) {
            titles = this.parseNovelpia(doc, options);
        }

        // 2. 네이버 시리즈 (Naver Series) 패턴 검사
        if (titles.length === 0) {
            const isNaver = doc.querySelector('a[class*="launchViewerForPreview"], ul.lst_thum, .volume_lst');
            if (isNaver) {
                titles = this.parseNaverSeries(doc, options);
            }
        }

        // 3. 문피아 (Munpia) 패턴 검사
        if (titles.length === 0) {
            const isMunpia = doc.querySelector('td.subject a, .list_episode, div[class*="episode-list"]');
            if (isMunpia) {
                titles = this.parseMunpia(doc, options);
            }
        }

        // 4. 범용 / 기타 플랫폼 패턴 검사
        if (titles.length === 0) {
            titles = this.parseGeneric(doc, options);
        }

        // 정제 및 중복/노이즈 제거
        titles = this.cleanTitles(titles, options);

        return titles;
    }

    /**
     * [노벨피아 전용 파서]
     * td[onclick*="/viewer/"] b 또는 tr.ep_style td.font12 b
     */
    static parseNovelpia(doc, options = {}) {
        const titles = [];
        // 노벨피아 회차 링크가 들어있는 요소 탐색
        const epCells = doc.querySelectorAll('td[onclick*="/viewer/"], tr[class*="ep_style"] td.font12, table.notice_table tr td.font12');

        epCells.forEach(cell => {
            const boldEl = cell.querySelector('b');
            let titleText = boldEl ? boldEl.textContent.trim() : cell.textContent.trim();

            // 내부 통계 수치나 아이콘 텍스트 제거
            titleText = titleText.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

            if (titleText && !titles.includes(titleText)) {
                titles.push(titleText);
            }
        });

        return titles;
    }

    /**
     * [네이버 시리즈 전용 파서]
     * a[class*="launchViewerForPreview"] 또는 ul.lst_thum li a
     * 상위 작품명 span은 제외하고 회차명(strong)만 정밀 추출
     */
    static parseNaverSeries(doc, options = {}) {
        const titles = [];
        const links = doc.querySelectorAll('a[class*="launchViewerForPreview"], ul.lst_thum li a, .volume_lst li a');

        links.forEach(link => {
            const strong = link.querySelector('strong');
            let titleText = '';

            if (strong) {
                titleText = strong.textContent.trim();
            } else {
                // span(작품명)을 복제본에서 제거하고 추출
                const clone = link.cloneNode(true);
                const spans = clone.querySelectorAll('span');
                spans.forEach(s => s.remove());
                titleText = clone.textContent.trim();
            }

            titleText = titleText.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

            if (titleText && !titles.includes(titleText)) {
                titles.push(titleText);
            }
        });

        return titles;
    }

    /**
     * [문피아 전용 파서]
     * td.subject a, .episode_item .title, .list_episode li a
     */
    static parseMunpia(doc, options = {}) {
        const titles = [];
        const items = doc.querySelectorAll('td.subject a, .episode_item .title, .list_episode li a, td.title a');

        items.forEach(el => {
            let titleText = el.textContent.trim();
            titleText = titleText.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
            if (titleText && !titles.includes(titleText)) {
                titles.push(titleText);
            }
        });

        return titles;
    }

    /**
     * [범용 웹소설 파서]
     */
    static parseGeneric(doc, options = {}) {
        const candidateSelectors = [
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

        for (const selector of candidateSelectors) {
            const els = doc.querySelectorAll(selector);
            if (els.length >= 2) {
                return Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
            }
        }

        // 링크 태그 순회 패턴 매칭
        const allLinks = Array.from(doc.querySelectorAll('a'));
        const episodePattern = /(?:제\s*\d+\s*[화장]|^\d+[화장\.]|프롤로그|에필로그|외전)/;
        const matching = allLinks
            .map(a => a.textContent.trim())
            .filter(t => t.length > 1 && t.length < 100 && episodePattern.test(t));

        if (matching.length >= 2) {
            return matching;
        }

        return [];
    }

    /**
     * 수집된 소제목 정제 (공지사항 필터링, 엔티티 디코딩, 노이즈 단어 제거)
     */
    static cleanTitles(titles, options = {}) {
        const { excludeNotices = false } = options;

        const noiseWords = [
            '로그인', '회원가입', '공지사항', '이벤트', '댓글', '추천', '선작',
            '마이페이지', 'TOP', '목차', '첫화보기', '최신화', '구매하기', '소장'
        ];

        const noticePatterns = [
            /\[공지\]/i,
            /^\s*공지\s*[:：]/i,
            /휴재\s*공지/i,
            /일러스트\s*공지/i,
            /작가의\s*말/i,
            /후기\s*공지/i
        ];

        const cleaned = titles
            .map(t => {
                // HTML 엔티티 디코딩 및 공백 정리
                return t
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/[\r\n\t]+/g, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
            })
            .filter(t => {
                if (t.length < 1 || t.length > 120) return false;
                if (noiseWords.some(w => t === w)) return false;

                if (excludeNotices) {
                    if (noticePatterns.some(p => p.test(t))) return false;
                }
                return true;
            });

        // 인접 중복만 제거
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
