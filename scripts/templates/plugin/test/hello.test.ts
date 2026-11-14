import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { helloTile } from '../src/actions/hello.ts';

describe('__NAME__ units', () => {
  it('hello tile shows the press count', () => {
    assert.equal(helloTile(0).value, '0');
    assert.deepEqual([helloTile(1).value, helloTile(1).status], ['1', 'press']);
    assert.equal(helloTile(2).status, 'presses');
  });
});
