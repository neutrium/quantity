export interface Parser<Result> {
    parse(val: string): Result;
}
