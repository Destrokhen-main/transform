import type StateBlock from 'markdown-it/lib/rules_block/state_block';
import type {MarkdownIt} from '../../typings';
import type {MarkdownItPluginOpts} from '../typings';

import {BASIC_TERM_REGEXP} from './constants';

export function termDefinitions(md: MarkdownIt, options: MarkdownItPluginOpts) {
    return (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
        let ch;
        let labelEnd;
        let pos = state.bMarks[startLine] + state.tShift[startLine];
        let max = state.eMarks[startLine];

        if (pos + 2 >= max) {
            return false;
        }

        if (state.src.charCodeAt(pos++) !== 0x5b /* [ */) {
            return false;
        }
        if (state.src.charCodeAt(pos++) !== 0x2a /* * */) {
            return false;
        }

        const labelStart = pos;

        for (; pos < max; pos++) {
            ch = state.src.charCodeAt(pos);
            if (ch === 0x5b /* [ */) {
                return false;
            } else if (ch === 0x5d /* ] */) {
                labelEnd = pos;
                break;
            } else if (ch === 0x5c /* \ */) {
                pos++;
            }
        }

        const newLineReg = new RegExp(/^(\r\n|\r|\n)/);
        const termReg = new RegExp(/^\[\*(\w+)\]:/);
        let currentLine = startLine;

        // Allow multiline term definition
        for (; currentLine < endLine; currentLine++) {
            const nextLineStart = state.bMarks[currentLine + 1];
            const nextLineEnd = state.eMarks[currentLine + 1];

            const nextLine =
                nextLineStart === nextLineEnd
                    ? state.src[nextLineStart]
                    : state.src.slice(nextLineStart, nextLineEnd);

            if (newLineReg.test(nextLine) || termReg.test(nextLine)) {
                break;
            }

            state.line = currentLine + 1;
        }

        max = state.eMarks[currentLine];

        if (!labelEnd || labelEnd < 0 || state.src.charCodeAt(labelEnd + 1) !== 0x3a /* : */) {
            return false;
        }

        if (silent) {
            return true;
        }

        const label = state.src.slice(labelStart, labelEnd).replace(/\\(.)/g, '$1');
        const title = state.src.slice(labelEnd + 2, max).trim();

        if (label.length === 0 || title.length === 0) {
            return false;
        }

        return processTermDefinition(
            md,
            options,
            state,
            currentLine,
            startLine,
            endLine,
            label,
            title,
        );
    };
}

function processTermDefinition(
    md: MarkdownIt,
    options: MarkdownItPluginOpts,
    state: StateBlock,
    currentLine: number,
    startLine: number,
    endLine: number,
    label: string,
    title: string,
) {
    let token;

    if (!state.env.terms) {
        state.env.terms = {};
    }

    const basicTermDefinitionRegexp = new RegExp(BASIC_TERM_REGEXP, 'gm');
    // If term inside definition

    const {isLintRun} = options;

    if (basicTermDefinitionRegexp.test(title) && isLintRun) {
        token = new state.Token('__yfm_lint', '', 0);
        token.hidden = true;
        token.map = [currentLine, endLine];
        token.attrSet('YFM008', 'true');
        state.tokens.push(token);
    }

    // If term definition duplicated
    if (state.env.terms[':' + label] && isLintRun) {
        token = new state.Token('__yfm_lint', '', 0);
        token.hidden = true;
        token.map = [currentLine, endLine];
        token.attrSet('YFM006', 'true');
        state.tokens.push(token);
        state.line = currentLine + 1;
        return true;
    }

    if (typeof state.env.terms[':' + label] === 'undefined') {
        state.env.terms[':' + label] = title;
    }

    token = new state.Token('dfn_open', 'dfn', 1);
    token.attrSet('class', 'yfm yfm-term_dfn');
    token.attrSet('id', ':' + label + '_element');
    token.attrSet('role', 'dialog');
    token.attrSet('aria-live', 'polite');
    token.attrSet('aria-modal', 'true');

    state.tokens.push(token);

    const titleTokens = md.parse(title, state.env);

    for (const titleToken of titleTokens) {
        if (titleToken.children?.length) {
            titleToken.content = '';
        }

        if (!titleToken.map) {
            state.tokens.push(titleToken);
            continue;
        }

        const [start, end] = titleToken.map;

        titleToken.map = [start + startLine, end + startLine];
        state.tokens.push(titleToken);
    }

    token = new state.Token('dfn_close', 'dfn', -1);

    state.tokens.push(token);

    /** current line links to end of term definition */
    state.line = currentLine + 1;

    return true;
}
