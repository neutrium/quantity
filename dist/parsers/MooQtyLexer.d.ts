import { Lexer, Token } from 'moo';
export declare class MooQtyLexer {
    private _lexer;
    constructor();
    get lexer(): Lexer;
    tokenize(val: string): Token[];
    next(): Token | undefined;
}
