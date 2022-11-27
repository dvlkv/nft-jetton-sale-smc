//
// Unlike ton-compiler's compileFunc this function don't include stdlib.fc
//
import { compileFunc as compileFuncInner } from '@ton-community/func-js';
import { Cell } from "ton";
import { readFileSync } from 'fs';

export async function compileFunc(source: string): Promise<{ fiftContent: string, cell: Cell  }> {
    let result = await compileFuncInner({
        // Entry points of your project
        entryPoints: ['0.fc'],
        // Sources
        sources: {
            '0.fc': source,
        },
    });

    if (result.status !== 'ok') {
        console.log(result.message);
        throw new Error('Unable to compile contract');
    }

    return { fiftContent: result.fiftCode, cell: Cell.fromBoc(Buffer.from(result.codeBoc, 'base64'))[0] };
}