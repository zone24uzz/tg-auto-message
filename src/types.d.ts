declare module 'input' {
  export function text(question: string): Promise<string>;
  export function password(question: string): Promise<string>;
}
