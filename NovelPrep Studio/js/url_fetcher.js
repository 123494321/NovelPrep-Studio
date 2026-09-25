/**
 * NovelPrep Studio - 만능 스마트 텍스트 정제 및 목차 추출 엔진
 * Version: v1.2.2
 * 
 * [핵심 기능]
 * 1. SmartTextCleaner: 사용자가 문피아, 네이버 시리즈, 카카오페이지, 노벨피아 등에서
 *    마우스로 아무렇게나 마구 긁어온 텍스트(조회수, 날짜, 무료, 댓글수, 링크 등 잡동사니 포함)를
 *    1초 만에 100% 순수한 소제목 목록으로 완벽 정제합니다.
 * 2. UrlTocFetcher: 웹 페이지 URL 수집(CORS 프록시 자동 폴백) 및 HTML 소스 파서.
 */

class SmartTextCleaner {
    /**
     * 마구 복사한 텍스트에서 순수 소제목 목록만 스마트하게 추출
     * @param {string} rawText 
     * @param {object} options { removeEpisodePrefix: boolean }
     * @returns {string[]}
     */
    static clean(rawText, options = {}) {
        if (!rawText) return [];

        const { removeEpisodePrefix = true } = options;
        const lines = rawText.split(/\r?\n/).map(l => l.trim());
        let result = [];

        // 1. 문피아 드래그 복사 패턴 검사
        // [숫자] \n [.] \n [소제목] \n [날짜/조회수/좋아요/글자수/무료]
        const isMunpia = this.checkMunpiaPattern(lines);
        if (isMunpia) {
            result = this.parseMunpiaLines(lines);
            if (result.length > 0) return this.finalize(result, removeEpisodePrefix);
        }

        // 2. 카카오페이지 마크다운 링크 패턴 검사
        // [작품명 N화날짜무료](https://...)
        const isKakao = lines.some(l => /\[.*?(\d+\s*화|프롤로그|에필로그).*?\]\(https?:\/\//.test(l) || /\[.*?(\d+\s*화).*?\d{2}\.\d{2}\.\d{2}.*?\]/.test(l));
        if (isKakao) {
            result = this.parseKakaoLines(lines);
            if (result.length > 0) return this.finalize(result, removeEpisodePrefix);
        }

        // 3. 노벨피아 패턴 검사 (EP.숫자 통계 줄 및 PLUS/무료 뱃지)
        const isNovelpia = this.checkNovelpiaPattern(lines);
        if (isNovelpia) {
            result = this.parseNovelpiaLines(lines);
            if (result.length > 0) return this.finalize(result, removeEpisodePrefix);
        }

        // 4. 네이버 시리즈 / 일반 회차 줄바꿈 패턴 검사
        // 예: 1화 재능 먹는 플레이어 (1) (2020.07.29.)
        result = this.parseSeriesAndGenericLines(lines);

        return this.finalize(result, removeEpisodePrefix);
    }

    /**
     * 문피아 패턴 여부 확인
     */
    static checkMunpiaPattern(lines) {
        for (let i = 0; i < lines.length - 2; i++) {
            if (/^\d+$/.test(lines[i]) && lines[i + 1] === '.' && lines[i + 2].length > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * 문피아 패턴 라인 파싱
     */
    static parseMunpiaLines(lines) {
        const titles = [];
        for (let i = 0; i < lines.length - 2; i++) {
            if (/^\d+$/.test(lines[i]) && lines[i + 1] === '.') {
                const titleCandidate = lines[i + 2];
                // 잡음 단어가 아닌 실제 소제목인지 검증
                if (titleCandidate && !this.isNoiseLine(titleCandidate)) {
                    titles.push(titleCandidate);
                }
            }
        }
        return titles;
    }

    /**
     * 카카오페이지 마크다운 링크 라인 파싱
     */
    static parseKakaoLines(lines) {
        const titles = [];
        for (const line of lines) {
            if (!line) continue;
            const match = line.match(/\[(.*?)\]/);
            if (match) {
                let inner = match[1];
                // 날짜 제거 (예: 21.07.23, 2021.07.23)
                inner = inner.replace(/\d{2,4}\.\d{2}\.\d{2}.*$/, '').trim();
                // 무료, 유료 등 부가 단어 제거
                inner = inner.replace(/무료|유료|소장|대여|기다무/g, '').trim();

                // 회차 번호나 소제목 분리
                const epMatch = inner.match(/(\d+\s*화.*)$/);
                if (epMatch) {
                    titles.push(epMatch[1].trim());
                } else if (inner.length > 0) {
                    titles.push(inner.trim());
                }
            }
        }
        return titles;
    }

    /**
     * 노벨피아 패턴 여부 확인 (EP.숫자 통계 줄 또는 PLUS 뱃지)
     */
    static checkNovelpiaPattern(lines) {
        return lines.some(l => /^EP\.\s*\d+/i.test(l.trim()));
    }

    /**
     * 노벨피아 패턴 라인 파싱
     */
    static parseNovelpiaLines(lines) {
        const titles = [];

        for (let line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // 1) EP.숫자 통계 라인 건너뛰기 (예: EP.0   1,070    10,830   57    591)
            if (/^EP\.\s*\d+/i.test(trimmed)) continue;

            // 2) 날짜 라인 건너뛰기 (예: 23.10.05, 2023.10.05)
            if (/^\d{2,4}\.\d{2}\.\d{2}\.?$/.test(trimmed)) continue;

            // 3) 앞머리의 노벨피아 뱃지 태그 제거 (무료, PLUS, PLUS 19, 독점, 성인, UP, NEW 등)
            let cleaned = trimmed.replace(/^(?:무료|유료|PLUS(?:\s*19)?|성인|독점|UP|NEW)\s+/i, '').trim();

            if (!cleaned || this.isNoiseLine(cleaned)) continue;

            if (!titles.includes(cleaned)) {
                titles.push(cleaned);
            }
        }

        return titles;
    }

    /**
     * 네이버 시리즈 및 일반 패턴 라인 파싱
     */
    static parseSeriesAndGenericLines(lines) {
        const titles = [];

        for (const line of lines) {
            if (!line) continue;
            if (this.isNoiseLine(line)) continue;

            let cleaned = line;

            // 1) 마크다운 링크 [제목](링크) 형태인 경우 제목만 추출
            const mdMatch = cleaned.match(/^\[(.*?)\]\(https?:\/\/[^\)]+\)$/);
            if (mdMatch) {
                cleaned = mdMatch[1];
            }

            // 2) 앞머리 플랫폼 뱃지 제거 (무료, PLUS, PLUS 19 등)
            cleaned = cleaned.replace(/^(?:무료|유료|PLUS(?:\s*19)?|성인|독점|UP|NEW)\s+/i, '').trim();

            // 3) 끝부분 무료/유료/다운로드/소장/대여/구매 태그 먼저 제거
            cleaned = cleaned.replace(/\s*(무료|유료|대여|소장|다운로드|구매)\s*$/g, '');

            // 4) 끝부분 날짜 제거: (2020.07.29.), 2020.07.29, 21.07.23 등
            cleaned = cleaned.replace(/\s*\(\s*\d{2,4}\.\d{2}\.\d{2}\.?\s*\)\s*$/g, '');
            cleaned = cleaned.replace(/\s*\d{2,4}\.\d{2}\.\d{2}\.?\s*$/g, '');

            // 5) 날짜 앞에 붙어있던 무료/유료 태그 재확인 제거
            cleaned = cleaned.replace(/\s*(무료|유료|대여|소장|다운로드|구매)\s*$/g, '');

            // 6) 노벨피아 스타일 조회/추천/댓글 잡음 제거
            cleaned = cleaned.replace(/\s*조회\s*[\d,]+.*$/, '');
            cleaned = cleaned.replace(/\s*추천\s*[\d,]+.*$/, '');
            cleaned = cleaned.replace(/\s*댓글\s*[\d,]+.*$/, '');
            cleaned = cleaned.replace(/\s*좋아요\s*[\d,]+.*$/, '');

            cleaned = cleaned.trim();

            if (cleaned.length > 0 && !titles.includes(cleaned)) {
                titles.push(cleaned);
            }
        }

        return titles;
    }

    /**
     * 노이즈 라인 여부 검사
     */
    static isNoiseLine(line) {
        const trimmed = line.trim();
        if (!trimmed) return true;

        // 링크
        if (/^https?:\/\//i.test(trimmed)) return true;
        if (/^\[미리보기\]/i.test(trimmed)) return true;
        if (/^\[다운로드\]/i.test(trimmed)) return true;

        // 노벨피아 EP.숫자 통계 라인 제거
        if (/^EP\.\s*\d+/i.test(trimmed)) return true;

        // 날짜만 있는 줄
        if (/^\d{2,4}\.\d{2}\.\d{2}\.?$/.test(trimmed)) return true;

        // 메타 통계 단어만 있는 줄
        const singleNoises = [
            '무료', '유료', '소장', '대여', '다운로드', '구매', '선물',
            '조회', '좋아요', '추천', '선작', '댓글', '글자수', '쪽',
            'UP', 'NEW', '공지', '목차', '첫화보기', '최신화'
        ];
        if (singleNoises.includes(trimmed)) return true;

        // 단순 숫자(페이지 번호나 통계 수치)만 있는 줄
        if (/^[\d,]+(쪽|화|개|명)?$/.test(trimmed) && trimmed.length <= 8) {
            // 단, '1화'처럼 의미 있는 것은 통과시키기 위해 화/장은 제외
            if (!trimmed.endsWith('화') && !trimmed.endsWith('장')) {
                return true;
            }
        }

        return false;
    }

    /**
     * 최종 정제: 회차 번호 접두사 분리 옵션 및 인접 중복 제거
     */
    static finalize(titles, removeEpisodePrefix = true) {
        const finalTitles = [];

        for (let t of titles) {
            let processed = t.trim();

            if (removeEpisodePrefix) {
                // "1화 재능 먹는 플레이어 (1)" -> "재능 먹는 플레이어 (1)"
                // "제1장 각성의 순간" -> "각성의 순간"
                // "1. 프롤로그" -> "프롤로그"
                const prefixMatch = processed.match(/^(\d+\s*화|\d+\.|\d+\s*장|제\s*\d+\s*[화장])\s*(.+)$/);
                if (prefixMatch && prefixMatch[2]) {
                    processed = prefixMatch[2].trim();
                }
            }

            if (processed.length > 0 && !finalTitles.includes(processed)) {
                finalTitles.push(processed);
            }
        }

        return finalTitles;
    }
}

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

        throw new Error('웹 브라우저의 보안 정책(CORS)으로 인해 링크를 직접 가져오지 못했습니다. 첫 번째 [⚡ 마우스 복사 텍스트 1초 정제] 탭을 이용하시면 1초 만에 깔끔하게 등록됩니다.');
    }

    /**
     * HTML 문서 텍스트에서 소제목(목차) 목록 추출
     * @param {string} htmlText 
     * @param {object} options
     * @returns {string[]}
     */
    static parseTocFromHtml(htmlText, options = {}) {
        if (!htmlText) return [];

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        // 연재 사이트에서 흔히 쓰이는 소제목 셀렉터 우선순위 리스트
        const candidateSelectors = [
            // 문피아
            'td[onclick*="/viewer/"] b',
            'tr.ep_style td.font12 b',
            'td.subject a',
            'td.title a',
            // 네이버 시리즈
            'a[class*="launchViewerForPreview"] strong',
            'ul.lst_thum li a strong',
            '.volume_lst li a strong',
            // 노벨피아
            'a[href*="/novel/"] .episode_title',
            '.episode_title',
            '.episode-title',
            '.episode_item .title',
            '.ep_title',
            '.sub_title',
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
            if (els.length >= 2) {
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
        
        let cleaned = foundTitles
            .map(t => t.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim())
            .filter(t => {
                if (t.length < 1 || t.length > 120) return false;
                if (noiseWords.some(w => t === w)) return false;
                if (options.excludeNotices && /(공지|휴재|이벤트|일러스트|후기)/.test(t)) return false;
                return true;
            });

        // 연속 중복 항목만 제거
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
    window.SmartTextCleaner = SmartTextCleaner;
    window.UrlTocFetcher = UrlTocFetcher;
    window.UrlTocFetcher.cleanDirtyText = SmartTextCleaner.clean.bind(SmartTextCleaner);
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SmartTextCleaner, UrlTocFetcher };
}
