/**
 * NovelPrep Studio - 소제목 정규화 & 순차 번호 주입 엔진
 * Version: v1.2.5
 * 
 * [핵심 원칙]
 * 1. 단방향 순차 전진 탐색 (Sequential Forward Search):
 *    이전 소제목을 찾은 위치(lastIndex) 이후의 영역에서만 다음 소제목을 탐색합니다.
 *    본문 내 동음이의어/대화/복선에 의한 오매칭을 원천 방지합니다.
 * 2. 독립 행 (줄 시작 ^) 필수화:
 *    소제목은 반드시 줄의 맨 앞에서 시작해야 하며, 문장/대사 중간에 언급된 고유명사는
 *    완벽히 무시하여 본문 오매칭을 차단합니다.
 * 3. 원문 100% 보존 원칙:
 *    작가가 의도한 빈 줄(장면 전환 연출), 특수문자, 문장부호 등 본문 내용은
 *    단 1글자도 변경하지 않고, 오직 매칭된 소제목 위치에만 지정된 번호 서식을 삽입합니다.
 */

class ManuscriptNormalizer {
    constructor() {
        this.tocList = [];
        this.rawText = '';
        this.normalizedText = '';
        this.diagnosticResult = null;
    }

    /**
     * 목차(소제목) 목록 설정
     * @param {string[]} titles 
     */
    setTocList(titles) {
        this.tocList = titles
            .map(t => (t || '').trim())
            .filter(t => t.length > 0);
    }

    /**
     * 원본 원고 텍스트 설정
     * @param {string} text 
     */
    setRawText(text) {
        this.rawText = text || '';
    }

    /**
     * 정규식 특수문자 이스케이프
     */
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 소제목 매칭용 정규식 패턴 생성
     * @param {string} title 
     * @param {object} options 
     * @returns {RegExp}
     */
    buildSearchPattern(title, options = {}) {
        const { flexSuffix = true, ignoreSpaces = true } = options;
        
        let cleanedTitle = title.trim();

        // 웹 플랫폼 부가 뱃지 제거 (예: [무료마지막화], [무료], [19금] 등)
        cleanedTitle = cleanedTitle.replace(/\[\s*(?:무료|유료|19금?|공지|단행본|특별편|외전|약수정|수정)[^\]]*\]/gi, '').trim();

        // 소제목 끝에 붙어있을 수 있는 부호(예: (1), [1], -1-, 1 등) 분리 감지
        // 예: "깨어난 그림자 (1)" -> base: "깨어난 그림자", suffix: "(1)"
        let basePattern = cleanedTitle;
        let suffixRegex = '';

        if (flexSuffix) {
            // 끝부분의 부호 패턴 검사: (1), [1], <1>, - 1 -, (상), (하), 1 등
            const suffixMatch = cleanedTitle.match(/\s*([(\[<]\s*[\d一-十상중하전후A-Za-z]+\s*[)\]>]|-+\s*\d+\s*-+|\s+\d+)$/);
            if (suffixMatch) {
                basePattern = cleanedTitle.substring(0, suffixMatch.index).trim();
                // 해당 부호가 원문에 있거나 없을 수도, 형태가 약간 다를 수도 있게 매칭
                suffixRegex = `(?:\\s*(?:[(<\\[]\\s*[\\d一-十상중하전후A-Za-z]+\\s*[)>\\]]|-+\\s*\\d+\\s*-+|\\s+\\d+))?`;
            } else {
                // 원래 소제목에 부호가 없더라도 본문에는 (1) 등이 붙어있을 수 있음
                suffixRegex = `(?:\\s*(?:[(<\\[]\\s*[\\d一-十상중하전후A-Za-z]+\\s*[)>\\]]|-+\\s*\\d+\\s*-+|\\s+\\d+))?`;
            }
        }

        // 작가 본문 부가 주석/메모 유연 매칭 (예: (*약수정), [무료마지막회], [완결], [完] 등)
        const annotationRegex = `(?:\\s*[\\(\\[<][^\\]\\)>\\r\\n]*(?:수정|무료|완결|完)[^\\]\\)>\\r\\n]*[\\]\\)>])?`;

        let escapedBase = this.escapeRegExp(basePattern);

        if (ignoreSpaces) {
            // 글자 사이 공백을 \s* 로 치환하여 띄어쓰기 오차 허용
            // 예: "깨어난 그림자" -> "깨\s*어\s*난\s*그\s*림\s*자"
            escapedBase = escapedBase.replace(/\s+/g, '\\s*');
        }

        // 선행 패턴(prefixGroup):
        // 1) 줄 시작(^)에서 공백, ─+ 구분선, 기존 회차 번호([1], 1화 등), [#■◆◇▶▷●○※★☆\\[<] 허용
        // 2) 또는 이전 회차 닫는 태그([>끝]) 뒤에 줄바꿈 없이 바로 붙은 경우
        // 3) 또는 본문/작가의 말 문장 뒤에 줄바꿈 없이 바로 붙은 <소제목> 형태 허용
        const existingEpPrefix = `(?:(?:\\[|\\(|<|제)?\\s*\\d+\\s*(?:화|장|편|회|\\.)?\\s*(?:\\]|\\)|>|\\.)?\\s*)?`;
        const prefixGroup = `(^[ \\t]*(?:─+[ \\t]*)?${existingEpPrefix}[#■◆◇▶▷●○※★☆\\[<]?[ \\t]*|(?:[>끝][ \\t]*[<]?[ \\t]*)|(?:[^\\r\\n][ \\t]*<[ \\t]*))`;

        // 후행 패턴(suffixGroup):
        // 1) 줄바꿈 기호(\r?\n 또는 끝). 단, 이전 회차 끝 태그(<... > 끝)를 소제목 시작으로 오인하지 않도록 방지
        // 2) 또는 구분선(─+) 등으로 인해 줄바꿈 없이 본문 첫 문장이 바로 이어진 경우((?=[^\r\n]))
        const suffixGroup = `([ \\t]*[\\]>]?[ \\t]*(?!(?:끝|[完]))(?:\\r?\\n|$)|(?=[^\\r\\n]))`;

        const fullPattern = `${prefixGroup}${escapedBase}${suffixRegex}${annotationRegex}${suffixGroup}`;

        return new RegExp(fullPattern, 'm');
    }

    /**
     * 회차 번호 템플릿 포맷팅
     * @param {string} template 예: "[{n}화]. {title}"
     * @param {number} episodeNum 회차 번호
     * @param {string} originalTitle 소제목
     * @returns {string}
     */
    formatEpisodeTitle(template, episodeNum, originalTitle) {
        return template
            .replace(/\{n\}/g, String(episodeNum))
            .replace(/\{title\}/g, originalTitle.trim());
    }

    /**
     * 단방향 순차 전진 탐색 번호 주입 실행
     * @param {object} config 
     * @returns {object} { success: boolean, normalizedText: string, diagnostics: object }
     */
    execute(config = {}) {
        const {
            formatTemplate = '[{n}화]. {title}',
            startNumber = 1,
            flexSuffix = true,
            ignoreSpaces = true
        } = config;

        if (!this.rawText) {
            throw new Error('원고 텍스트(.txt)가 등록되지 않았습니다.');
        }

        if (!this.tocList || this.tocList.length === 0) {
            throw new Error('목차(소제목) 목록이 등록되지 않았습니다.');
        }

        const source = this.rawText;
        const totalLen = source.length;
        let lastSearchIndex = 0; // 단방향 순차 탐색의 기준 오프셋
        let resultChunks = [];
        
        const matches = [];
        const unmatched = [];

        const parsedStart = Number(startNumber);
        let currentEpisodeNum = isNaN(parsedStart) ? 1 : parsedStart;

        // 목차 순서대로 하나씩 순차 전진 탐색 진행
        for (let i = 0; i < this.tocList.length; i++) {
            const rawTitle = this.tocList[i];
            const pattern = this.buildSearchPattern(rawTitle, { flexSuffix, ignoreSpaces });

            // 이전 탐색 완료 지점(lastSearchIndex) 이후의 슬라이스에서 검색
            const remainingText = source.substring(lastSearchIndex);
            let match = pattern.exec(remainingText);

            // 비표준 한글/인코딩 글자 깨짐 대응 지능형 안전 폴백 (예: 누구냗! vs 누구†d!)
            if (!match && rawTitle.length >= 2) {
                const prefix2 = this.escapeRegExp(rawTitle.substring(0, 2));
                const fuzzyPattern = new RegExp(`(^[ \\t]*[#■◆◇▶▷●○※★☆\\[<]?[ \\t]*|끝[ \\t]*<)[ \\t]*${prefix2}[^\\r\\n>\\]]{1,10}([ \\t]*[\\]>]?[ \\t]*(?:\\r?\\n|$))`, 'm');
                const fMatch = fuzzyPattern.exec(remainingText);
                if (fMatch) {
                    match = fMatch;
                }
            }

            if (match) {
                const matchOffsetInRemaining = match.index;
                const matchLength = match[0].length;
                const absoluteStartIndex = lastSearchIndex + matchOffsetInRemaining;
                const absoluteEndIndex = absoluteStartIndex + matchLength;

                // 1) 이전 매칭 끝지점부터 현재 매칭 시작지점까지의 원문 그대로 보존
                const leadingOriginal = source.substring(lastSearchIndex, absoluteStartIndex);
                resultChunks.push(leadingOriginal);

                // 2) 매칭된 제목을 새로운 정규화 형식으로 변환
                let prefixDecor = match[1] || '';
                let suffixDecor = match[2] || '\n';
                
                // 특수 상황 처리 1: ──────── 기호가 앞에 붙어있던 경우, 지저분한 구분선을 지우고 소제목만 깔끔하게 주입
                if (/─{2,}/.test(prefixDecor)) {
                    prefixDecor = '';
                } else if (/[>끝]/.test(prefixDecor)) {
                    // 특수 상황 처리 2: 이전 회차 끝('끝' 또는 '>') 뒤에 줄바꿈 없이 붙은 경우 앞 회차 보존 후 개행
                    const endingChar = prefixDecor.match(/[>끝]+/)[0];
                    prefixDecor = endingChar + '\r\n\r\n';
                } else if (/(?:^|\s|\[)(?:제\s*)?\d+[화장편회.]?\]?/.test(prefixDecor) || /^[ \t]*[\[<]?[ \t]*$/.test(prefixDecor)) {
                    // 기존 회차 번호([1], 1화 등) 또는 단순 장식 괄호([, < 등)는 새 번호로 교체
                    prefixDecor = '';
                } else if (/[^ \t\r\n]/.test(prefixDecor)) {
                    // 문장 뒤에 줄바꿈 없이 <소제목>이 붙은 경우 앞 문장 보존 후 개행
                    const before = prefixDecor.replace(/[#■◆◇▶▷●○※★☆\\[<][ \\t]*$/, '');
                    prefixDecor = before + '\r\n\r\n';
                } else {
                    prefixDecor = '';
                }

                // 후행 장식자 정리: 닫는 괄호(], >) 정리
                suffixDecor = suffixDecor.replace(/^[ \t]*[\]>][ \t]*/, '');

                // 특수 상황 처리 3: 소제목 뒤에 본문이 바로 이어진 경우(줄바꿈이 없던 경우), 본문 첫 문장을 다음 줄로 안전 분리
                if (!/\r?\n$/.test(suffixDecor)) {
                    suffixDecor = '\r\n\r\n' + suffixDecor;
                }

                const newTitle = this.formatEpisodeTitle(formatTemplate, currentEpisodeNum, rawTitle);
                
                // 원문의 줄바꿈 구조 유지: 선행/후행 공백 및 개행을 보존하며 제목만 교체
                const replacedPart = `${prefixDecor}${newTitle}${suffixDecor}`;
                resultChunks.push(replacedPart);

                // 진단 데이터 기록
                matches.push({
                    index: i + 1,
                    episodeNum: currentEpisodeNum,
                    title: rawTitle,
                    matchedText: match[0].trim(),
                    startIndex: absoluteStartIndex,
                    endIndex: absoluteEndIndex,
                    line: this.getLineNumber(source, absoluteStartIndex)
                });

                // 단방향 순차 전진: 다음 탐색은 현재 매칭이 끝난 위치 이후부터 시작!
                lastSearchIndex = absoluteEndIndex;
                currentEpisodeNum++;
            } else {
                // 본문에서 찾지 못한 소제목 기록
                unmatched.push({
                    index: i + 1,
                    expectedEpisodeNum: currentEpisodeNum,
                    title: rawTitle
                });
            }
        }

        // 마지막 매칭 이후의 남은 본문 전체를 100% 원형 그대로 보존하여 붙임
        if (lastSearchIndex < totalLen) {
            resultChunks.push(source.substring(lastSearchIndex));
        }

        this.normalizedText = resultChunks.join('');
        this.diagnosticResult = {
            totalToc: this.tocList.length,
            successCount: matches.length,
            missingCount: unmatched.length,
            matches: matches,
            unmatched: unmatched,
            originalLength: totalLen,
            normalizedLength: this.normalizedText.length
        };

        return {
            success: true,
            normalizedText: this.normalizedText,
            diagnostics: this.diagnosticResult
        };
    }

    /**
     * 오프셋 위치의 줄 번호 계산 (1-indexed)
     */
    getLineNumber(text, index) {
        if (index <= 0) return 1;
        const sub = text.substring(0, index);
        const newlines = sub.match(/\n/g);
        return newlines ? newlines.length + 1 : 1;
    }
}

// 전역 객체 등록
if (typeof window !== 'undefined') {
    window.ManuscriptNormalizer = ManuscriptNormalizer;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ManuscriptNormalizer };
}
