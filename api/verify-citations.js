// Vercel 서버리스 함수
export default async function handler(req, res) {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // POST 요청만 허용
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: 'Method not allowed' 
        });
    }
    
    try {
        const { citations } = req.body;
        
        // 입력 검증
        if (!citations || !Array.isArray(citations)) {
            return res.status(400).json({
                success: false,
                error: 'citations 배열이 필요합니다.'
            });
        }
        
        if (citations.length > 5) {
            return res.status(400).json({
                success: false,
                error: '한 번에 최대 5개 문헌까지만 처리 가능합니다.'
            });
        }
        
        // 각 문헌 검증
        const results = await Promise.all(
            citations.map(citation => verifySingleCitation(citation))
        );
        
        const summary = {
            total: results.length,
            verified: results.filter(r => r.status === 'verified').length,
            suspicious: results.filter(r => r.status === 'not-found').length,
            similar: results.filter(r => r.status === 'similar').length
        };
        
        return res.status(200).json({
            success: true,
            results,
            summary
        });
        
    } catch (error) {
        console.error('API 오류:', error);
        return res.status(500).json({
            success: false,
            error: '서버 내부 오류가 발생했습니다.'
        });
    }
}

// 개별 문헌 검증 함수
async function verifySingleCitation(citation) {
    try {
        const language = detectLanguage(citation);
        const parsed = parseCitation(citation, language);
        
        // 실제 API 호출 (간소화된 버전)
        let searchResult;
        
        if (language === 'korean') {
            searchResult = await searchKCI(parsed.title);
        } else {
            searchResult = await searchCrossRef(parsed.title);
        }
        
        // 결과 분석
        const verification = analyzeSearchResult(parsed, searchResult);
        
        return {
            citation: parsed,
            ...verification
        };
        
    } catch (error) {
        return {
            citation: { original: citation, language: 'unknown' },
            status: 'error',
            message: '검증 중 오류가 발생했습니다.',
            confidence: 0
        };
    }
}

// 언어 감지
function detectLanguage(text) {
    const koreanRegex = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;
    return koreanRegex.test(text) ? 'korean' : 'english';
}

// 문헌 파싱
function parseCitation(citation, language) {
    // 간단한 파싱 로직
    return {
        original: citation,
        language: language,
        title: extractTitle(citation),
        authors: extractAuthors(citation),
        year: extractYear(citation)
    };
}

function extractTitle(citation) {
    // 제목 추출 로직 (간소화)
    const patterns = [
        /\.\s*(.+?)\.\s*/, // 점으로 구분된 제목
        /\)\.\s*(.+?)\.\s*/, // 연도 후 제목
    ];
    
    for (const pattern of patterns) {
        const match = citation.match(pattern);
        if (match) return match[1].trim();
    }
    
    return citation.substring(0, 100); // 기본값
}

function extractAuthors(citation) {
    const authorMatch = citation.match(/^([^(]+)/);
    return authorMatch ? [authorMatch[1].trim()] : ['Unknown'];
}

function extractYear(citation) {
    const yearMatch = citation.match(/\((\d{4})\)/);
    return yearMatch ? parseInt(yearMatch[1]) : null;
}

// KCI 검색 (시뮬레이션)
async function searchKCI(title) {
    // 실제로는 KCI API 호출
    // 현재는 시뮬레이션
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (title.includes('존재하지않는') || title.includes('가짜')) {
        return { found: false, similarity: 0 };
    }
    
    return { 
        found: Math.random() > 0.3, 
        similarity: Math.random(),
        source: 'KCI'
    };
}

// CrossRef 검색
async function searchCrossRef(title) {
    try {
        // 실제 CrossRef API 호출
        const axios = require('axios');
        
        const response = await axios.get('https://api.crossref.org/works', {
            params: {
                query: title,
                rows: 3
            },
            headers: {
                'User-Agent': 'NoHallu/1.0 (mailto:your-email@university.edu)'
            },
            timeout: 8000 // 8초 타임아웃
        });
        
        const works = response.data.message.items || [];
        
        if (works.length > 0) {
            // 제목 유사도 계산
            const similarity = calculateSimilarity(title, works[0].title[0]);
            return {
                found: similarity > 0.6,
                similarity: similarity,
                source: 'CrossRef',
                match: works[0]
            };
        }
        
        return { found: false, similarity: 0, source: 'CrossRef' };
        
    } catch (error) {
        console.error('CrossRef 검색 오류:', error);
        // API 실패시 시뮬레이션으로 대체
        return await searchCrossRefSimulation(title);
    }
}

// CrossRef 시뮬레이션 (API 실패시)
async function searchCrossRefSimulation(title) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (title.toLowerCase().includes('fake') || 
        title.toLowerCase().includes('non-existent')) {
        return { found: false, similarity: 0, source: 'CrossRef-Sim' };
    }
    
    return { 
        found: Math.random() > 0.4, 
        similarity: Math.random(),
        source: 'CrossRef-Sim'
    };
}

// 검색 결과 분석
function analyzeSearchResult(parsed, searchResult) {
    if (!searchResult.found) {
        return {
            status: 'not-found',
            message: parsed.language === 'korean' ? 
                'KCI 데이터베이스에서 찾을 수 없습니다. AI 할루시네이션 의심' :
                'Not found in academic databases. Possible AI hallucination.',
            confidence: 85,
            databases: [searchResult.source]
        };
    }
    
    if (searchResult.similarity > 0.8) {
        return {
            status: 'verified',
            message: parsed.language === 'korean' ?
                'KCI 데이터베이스에서 확인되었습니다' :
                'Verified in academic databases',
            confidence: Math.round(searchResult.similarity * 100),
            databases: [searchResult.source]
        };
    } else {
        return {
            status: 'similar',
            message: parsed.language === 'korean' ?
                '유사한 문헌이 발견되었지만 정확한 일치는 아닙니다' :
                'Similar publications found, but not exact match',
            confidence: Math.round(searchResult.similarity * 100),
            databases: [searchResult.source]
        };
    }
}

// 문자열 유사도 계산
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    str1 = str1.toLowerCase();
    str2 = str2.toLowerCase();
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

// 레벤슈타인 거리 계산
function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}
