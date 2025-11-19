import jwt from 'jsonwebtoken';

export default function (req, res, next) {
  // 1) Try custom header: x-auth-token
  let token = req.header('x-auth-token');

  // 2) If not found, try standard Authorization: Bearer <token>
  if (!token) {
    const authHeader = req.header('authorization') || req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // remove "Bearer "
    }
  }

  // 3) If still no token → 401
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  // 4) Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Here we expect your payload to be { user: { id: ... } }
    req.user = decoded.user;
    next();
  } catch (err) {
    console.error('[AUTH] JWT verify failed:', err.message);
    res.status(401).json({ msg: 'Token is not valid' });
  }
}
