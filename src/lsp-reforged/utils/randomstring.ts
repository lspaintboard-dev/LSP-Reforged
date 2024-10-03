const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function randomString(n: number): string {
    let t = "";
    for(let i = 1; i <= n; i++) t += charset.charAt(Math.floor(Math.random() * charset.length));
    return t;
}