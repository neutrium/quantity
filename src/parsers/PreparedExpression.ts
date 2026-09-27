import type Nearley from 'nearley';
import type { Token } from 'moo';
import type { CloneableLexer } from './MooQtyLexer.js';
import { INPUT_SCALAR } from './scalar-expression.js';

/** One-shot lexer adapter: inspect the first token once, then continue the same stream. */
export class PreparedExpression implements Nearley.Lexer
{
	readonly key: string;
	readonly scalar: string;
	readonly baseOffset: number;
	readonly scalarOffset: number;
	last?: Token;
	openGroups = 0;
	private initial?: Token;

	constructor(private readonly lexer: CloneableLexer, input: string)
	{
		lexer.reset(input);
		let first = lexer.next();

		while (first?.type === 'ws')
		{
			first = lexer.next();
		}

		const parameter = first?.type === 'integer' || first?.type === 'signedFloat';
		this.scalar = parameter ? first!.value : '1';
		this.scalarOffset = first?.offset ?? 0;
		this.baseOffset = parameter ? first!.offset + first!.text.length : first?.offset ?? 0;
		this.key = (parameter ? 'scalar:' : 'bare:') + input.slice(this.baseOffset).trimEnd();

		// Moo creates fresh tokens for this call; adjust them in place instead of
		// allocating a second object for every token in long expressions.
		if (first)
		{
			first.offset = parameter ? -1 : 0;

			if (parameter)
			{
				first.value = INPUT_SCALAR;
			}
		}

		this.initial = first;
	}

	// Nearley calls reset once at feed(). This stream is already reset and primed;
	// each parser call owns its adapter, so failures and reentry cannot leak state.
	reset(): void { }

	save(): Nearley.LexerState
	{
		return this.lexer.save();
	}

	formatError(): string
	{
		return 'Invalid quantity expression';
	}

	next(): Token | undefined
	{
		let token = this.initial;

		if (token)
		{
			this.initial = undefined;
		}
		else
		{
			try
			{
				const next = this.lexer.next();

				if (next)
				{
					next.offset -= this.baseOffset;
					token = next;
				}
			}
			catch (error)
			{
				const failure = error as Error & { token?: Token };

				if (failure.token)
				{
					failure.token.offset -= this.baseOffset;
				}

				throw error;
			}
		}

		if (token)
		{
			if (token.type === 'lParen')
			{
				this.openGroups++;
			}

			if (token.type === 'rParen')
			{
				this.openGroups--;
			}

			if (token.type !== 'ws')
			{
				this.last = token;
			}
		}
		return token;
	}

	sourceOffset(offset: number): number
	{
		return offset < 0 ? this.scalarOffset : this.baseOffset + offset;
	}
}
