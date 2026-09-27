@preprocessor typescript

@{%
import { MooQtyLexer } from './MooQtyLexer.js';
import { numberExpression, unitExpression, product, power, implicitProduct, group, signedGroup, reciprocal } from './quantity-expression.js';
export const lexer = new MooQtyLexer().lexer;
%}

@lexer lexer

main -> %ws:? EXPR %ws:? {% data => data[1] %}

# Powers bind first, then dot products, then left-associative */whitespace.
EXPR -> EXPR %ws:? %mul %ws:? DOT {% data => product(data[0], data[4], false, data[2].offset) %}
      | EXPR %ws:? %div %ws:? DOT {% data => product(data[0], data[4], true, data[2].offset) %}
      | EXPR %ws DOT {% data => implicitProduct(data[0], data[2]) %}
      | %div %ws:? DOT {% data => reciprocal(data[2], data[0].offset) %}
      | DOT {% id %}

DOT -> DOT %ws:? %dot %ws:? FACTOR {% data => product(data[0], data[4], false, data[2].offset) %}
     | FACTOR {% id %}

# Adjacent scalar and units form a single factor (2m); whitespace is multiplication.
FACTOR -> SCALAR_POWER UNIT_POWER {% data => implicitProduct(data[0], data[1]) %}
        | SCALAR_POWER {% id %}
        | UNIT_POWER {% id %}

UNIT_POWER -> ATOM %ws:? %pwr %ws:? %integer {% data => power(data[0], data[4], true) %}
            | ATOM %integer {% data => power(data[0], data[1], true) %}
            | ATOM %superscript {% data => power(data[0], data[1], true) %}
            | ATOM {% id %}
            | GROUP_POWER {% id %}
            | %sign %ws:? GROUP_POWER {% data => signedGroup(data[0], data[2]) %}

ATOM -> %unit {% data => unitExpression(data[0]) %}

GROUP_POWER -> GROUP %ws:? %pwr %ws:? NUMBER_TOKEN {% data => power(data[0], data[4], true) %}
             | GROUP %integer {% data => power(data[0], data[1], true) %}
             | GROUP %superscript {% data => power(data[0], data[1], true) %}
             | GROUP {% id %}
GROUP -> %lParen %ws:? EXPR %ws:? %rParen {% data => group(data[2]) %}

SCALAR_POWER -> NUMBER %ws:? %pwr %ws:? NUMBER_TOKEN {% data => power(data[0], data[4], false) %}
              | NUMBER %superscript {% data => power(data[0], data[1], false) %}
              | NUMBER {% id %}
NUMBER -> NUMBER_TOKEN {% data => numberExpression(data[0]) %}
NUMBER_TOKEN -> %integer {% id %}
              | %signedFloat {% id %}
