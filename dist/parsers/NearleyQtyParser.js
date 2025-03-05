import Nearley from 'nearley/lib/nearley.js';
import grammar from './qty-grammar.js';
export class NearleyQtyParser {
    constructor() { }
    parse(val) {
        // You have to create a new parser each time to reset the state
        const parser = new Nearley.Parser(Nearley.Grammar.fromCompiled(grammar));
        parser.feed(val);
        const results = parser.results;
        if (results === undefined) {
            throw new Error("Unit not recognized");
        }
        else {
            return results[0];
        }
    }
}
