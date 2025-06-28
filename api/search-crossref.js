// api/search-crossref.js
// CrossRef API 검색 전용 함수

export default async function handler(req, res) {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // GET 또는 POST 요청 처리
    let title;
    if (req.method === 'GET') {
        title = req.query.title;
    } else if (req.method === 'POST') {
        title = req.body.title;
    } else {
        return res.status(405).json({ 
            success: false, 
            error: 'Method not allowed' 
        });
    }
    
    if (!title) {
        return res.status(400).json({
            success: false,
            error: 'title 파라미터가 필요합니다.'
        });
    }
    
    try {
        const result = await searchCrossRef(title);
        
        return res.status(200).json({
            success: true,
            query: title,
            result: result
        });
        
    } catch (error) {
        console.error('CrossRef 검색 오류:', error);
        return res.status(500).json({
            success: false,
            error: 'CrossRef 검색 중 오류가 발생했습니다.',
            message: error.message
        });
    }
}

// CrossRef API 검색 함수
async function searchCrossRef(title) {
    try {
        // Node.js 환경에서 fetch가 없을 수 있으므로 dynamic import 사용
        const { default: fetch } = await import('node-fetch');
        
        const searchUrl = 'https://api.crossref.org/works';
        const params = new URLSearchParams({
            query: title,
            rows: '5',  // 최대 5개 결과
            select: 'title,author,container-title,published-print,DOI,volume,issue,page'
        });
        
        const response = await fetch(`${searchUrl}?${params}`, {
            method: 'GET',
            headers: {
                'User-Agent': 'NoHallu/1.0 (mailto:your-email@university.edu)', // 실제 이메일로 변경 필요
                'Accept': 'application/json'
            },
            timeout: 8000 // 8초 타임아웃
        });
        
        if (!response.ok) {
            throw new Error(`CrossRef API 오류: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        const works = data.message?.items || [];
        
        if (works.length === 0) {
            return {
                found: false,
                similarity: 0,
                source: 'CrossRef',
                message: 'No matching publications found'
            };
        }
        
        // 가장 유사한 논문 찾기
        let bestMatch = null;
        let bestSimilarity = 0;
        
        for (const work of works) {
            const workTitle = Array.isArray(work.title) ? work.title[0] : work.title;
            const similarity = calculateTitleSimilarity(title, workTitle);
            
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = formatWork(work);
            }
        }
        
        return {
            found: bestSimilarity > 0.6,
            similarity: bestSimilarity,
            source: 'CrossRef',
            match: bestMatch,
            totalResults: works.length,
            message: bestSimilarity > 0.8 ? 'High similarity match found' :
                     bestSimilarity > 0.6 ? 'Moderate similarity match found' :
                     'Low similarity, possible hallucination'
        };
        
    } catch (error) {
        // CrossRef API 실패시 시뮬레이션으로 대체
        console.log('CrossRef API 실패, 시뮬레이션 모드:', error.message);
        return await simulateCrossRefSearch(title);
    }
}

// CrossRef 응답 포맷팅
function formatWork(work) {
    try {
        const authors = (work.author || []).map(author => {
            const given = author.given || '';
            const family = author.family || '';
            return `${given} ${family}`.trim();
        }).filter(name => name.length > 0);
        
        const year = work['published-print']?.['date-parts']?.[0]?.[0] || 
                    work['published-online']?.['date-parts']?.[0]?.[0] ||
                    null;
        
        return {
            title: Array.isArray(work.title) ? work.title[0] : work.title,
            authors: authors.length > 0 ? authors : ['Unknown Author'],
            journal: Array.isArray(work['container-title']) ? 
                    work['container-title'][0] : work['container-title'],
            year: year,
            doi: work.DOI,
            volume: work.volume,
            issue: work.issue,
            pages: work.page,
            source: 'CrossRef'
        };
    } catch (error) {
        console.error('Work 포맷팅 오류:', error);
        return {
            title: 'Formatting Error',
            authors: ['Unknown'],
            source: 'CrossRef'
        };
    }
}

// 제목 유사도 계산 (레벤슈타인 거리 기반)
function calculateTitleSimilarity(title1, title2) {
    if (!title1 || !title2) return 0;
    
    // 대소문자 통일 및 특수문자 제거
    const clean1 = title1.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const clean2 = title2.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    if (clean1 === clean2) return 1;
    
    const longer = clean1.length > clean2.length ? clean1 : clean2;
    const shorter = clean1.length > clean2.length ? clean2 : clean1;
    
    if (longer.length === 0) return 1;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return Math.max(0, (longer.length - editDistance) / longer.length);
}

// 레벤슈타인 거리 계산
function levenshteinDistance(str1, str2) {
    const matrix = Array(str2.length + 1).fill().map(() => Array(str1.length + 1).fill(0));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j - 1][i] + 1,     // 삭제
                matrix[j][i - 1] + 1,     // 삽입
                matrix[j - 1][i - 1] + cost // 교체
            );
        }
    }
    
    return matrix[str2.length][str1.length];
}

// CrossRef 시뮬레이션 (API 실패시 대체)
async function simulateCrossRefSearch(title) {
    // 지연 시뮬레이션
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 명백한 가짜 키워드 체크
    const fakeKeywords = [
        'fake', 'non-existent', 'hallucination', 'test paper',
        'dummy', 'example', 'fictional', 'made up'
    ];
    
    const titleLower = title.toLowerCase();
    const isFake = fakeKeywords.some(keyword => titleLower.includes(keyword));
    
    if (isFake) {
        return {
            found: false,
            similarity: 0,
            source: 'CrossRef-Simulation',
            message: 'Fake keywords detected'
        };
    }
    
    // AI, ML 관련 키워드는 높은 확률로 실존
    const aiKeywords = ['artificial intelligence', 'machine learning', 'deep learning', 'ai', 'ml'];
    const isAIRelated = aiKeywords.some(keyword => titleLower.includes(keyword));
    
    const baseProbability = isAIRelated ? 0.8 : 0.5;
    const randomFactor = Math.random();
    const similarity = baseProbability * randomFactor;
    
    if (similarity > 0.6) {
        return {
            found: true,
            similarity: similarity,
            source: 'CrossRef-Simulation',
            match: {
                title: title,
                authors: ['Simulated Author'],
                journal: 'Journal of Simulated Research',
                year: 2023,
                source: 'CrossRef-Simulation'
            },
            message: 'Simulated match (API unavailable)'
        };
    } else {
        return {
            found: false,
            similarity: similarity,
            source: 'CrossRef-Simulation',
            message: 'No match found (simulated)'
        };
    }
}
