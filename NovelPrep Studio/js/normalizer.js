/**
 * NovelPrep Studio - 소제목 정규화 & 순차 번호 주입 엔진
 * Version: v1.2.6 (Clean Standard Rollback & CRLF Stabilization)
 * 
 * [핵심 원칙]
 * 1. 단방향 순차 전진 탐색 (Sequential Forward Search):
 *    이전 소제목을 찾은 위치(lastIndex) 이후의 영역에서만 다음 소제목을 탐색합니다.
 *    본문 내 동음이의어/대화/복선에 의한 오매칭을 원천 방지합니다.
 * 2. 독립 행 (줄 시작 ^) 필수화:
 *    소제목은 반드시 독립된 행(줄의 시작 ^)이어야 하며, 문장/대사 중간에 언급된
 *    단어는 철저히 배제하여 원고 본문의 손상을 완벽히 차단합니다.
 * 3. 원문 100% 보존 및 표준 개행(CRLF) 보장:
 *    줄바꿈 경계를 깨뜨리지 않고, 최종 출력 시 윈도우 표준 CRLF(\r\n)로 완벽히 규격화하여
 *    어떤 전자책 뷰어나 웹 툴에서도 100% 안정적으로 인식되도록 보장합니다.
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
     * 원본 원고 텍스트 설정 (모든 줄바꿈을 표준 \n으로 정돈하여 메모리에 적재)
     * @param {string} text 
     */
    setRawText(text) {
        // 모든 줄바꿈(\r\n, 단독 \r)을 표준 \n으로 통일하여 메모리에 적재
        // 탐색/슬라이싱 중 \r이 단독 분리되는 버그를 원천 차단
        this.rawText = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    /**
     * 정규식 특수문자 이스케이프
     */
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 소제목 매칭용 정규식 패턴 생성 (군더더기 없는 표준 독립 행 패턴)
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
        const annotationRegex = `(?:\\s*[\\(\\[<][^\\]\\)>\\n]*(?:수정|무료|완결|完)[^\\]\\)>\\n]*[\\]\\)>])?`;

        let escapedBase = this.escapeRegExp(basePattern);

        if (ignoreSpaces) {
            // 글자 사이 공백을 \s* 로 치환하여 띄어쓰기 오차 허용
            escapedBase = escapedBase.replace(/\s+/g, '\\s*');
        }

        // 선행 패턴(prefixGroup):
        // 반드시 줄의 시작(^)에서 시작하며, 공백, 기존 회차 번호([1], 1화, 제1화, 1. 등), 장식 괄호([, < 등) 허용
        const existingEpPrefix = `(?:(?:\\[|\\(|<|제)?\\s*\\d+\\s*(?:화|장|편|회|\\.)?\\s*(?:\\]|\\)|>|\\.)?\\s*)?`;
        const prefixGroup = `(^[ \\t]*${existingEpPrefix}[#■◆◇▶▷●○※★☆\\[<]?[ \\t]*)`;

        // 후행 패턴(suffixGroup): 닫는 장식 및 줄바꿈 기호(\n 또는 텍스트 끝)
        const suffixGroup = `([ \\t]*[\\]>]?[ \\t]*(?:\\n|$))`;

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

            // 이전 탐색 완료 지점(lastSearchIndex) 이후의 슬라이스에서만 검색
            const remainingText = source.substring(lastSearchIndex);
            let match = pattern.exec(remainingText);

            if (match) {
                const matchOffsetInRemaining = match.index;
                const matchLength = match[0].length;
                const absoluteStartIndex = lastSearchIndex + matchOffsetInRemaining;
                const absoluteEndIndex = absoluteStartIndex + matchLength;

                // 1) 이전 매칭 끝지점부터 현재 매칭 시작지점까지의 원문 그대로 보존
                const leadingOriginal = source.substring(lastSearchIndex, absoluteStartIndex);
                resultChunks.push(leadingOriginal);

                // 2) 매칭된 제목을 새로운 정규화 형식으로 변환
                // 후행 장식자 정리: 닫는 괄호(], >) 정리 후 원래 줄바꿈 유지
                let suffixDecor = match[2] || '\n';
                suffixDecor = suffixDecor.replace(/^[ \t]*[\]>][ \t]*/, '');

                const newTitle = this.formatEpisodeTitle(formatTemplate, currentEpisodeNum, rawTitle);
                
                // 원문의 줄바꿈 구조 완벽 보존
                const replacedPart = `${newTitle}${suffixDecor}`;
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

                // 단방향 순차 전진: 다음 탐색은 현재 매칭이 끝난 위치 이후부터 시작
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

        // 최종 결과 텍스트: 모든 줄바꿈을 윈도우 표준 CRLF(\r\n)로 완벽하게 규격화하여 저장
        const joined = resultChunks.join('');
        this.normalizedText = joined.replace(/\n/g, '\r\n');

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
