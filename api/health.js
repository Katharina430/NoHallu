export default function handler(req, res) {
    res.status(200).json({
        success: true,
        message: 'NoHallu API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
}
