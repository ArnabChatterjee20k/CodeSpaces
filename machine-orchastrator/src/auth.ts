import jwt from "jsonwebtoken";
// should be same as the control_plane secret key and algorithm
const SECRET_KEY = "your-secret-key";
const ALGORITHM = "HS256";

export interface User {
  user_id: string;
}

export const getToken = (user: User) => {
  const token = jwt.sign(user, SECRET_KEY, { algorithm: ALGORITHM });
  return token;
};

export const verifyToken = (token: string) => {
  try {
    const payload = jwt.verify(token, SECRET_KEY, {
      algorithms: [ALGORITHM],
    }) as User;
    return payload;
  } catch (error) {
    return null;
  }
};