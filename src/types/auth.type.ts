export interface loginType {
    email: string,
    password: string
}

export interface AuthRequest extends Request {
    userId?: string;
}