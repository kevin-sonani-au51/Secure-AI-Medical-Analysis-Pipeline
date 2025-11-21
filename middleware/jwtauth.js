import jwt from "jsonwebtoken";

// Middleware to authenticate JWT tokens
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization; // Expecting "Bearer <token>"
  if (!authHeader) {
    return res.status(401).json({ message: "No token provided" });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res
      .status(401)
      .json({ message: "Invalid authorization header format" });
  }

  const token = parts[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = decoded; // Attach decoded token payload to request
    next(); // Proceed to next middleware or route handler
  });
};

export default authenticateJWT;
