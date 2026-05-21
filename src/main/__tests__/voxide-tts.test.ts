import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// TTS code reading logic — mirrors the pure functions in useTTS.ts.
// These test the code analysis and symbol translation without needing
// the Web Speech API or any browser environment.
// ---------------------------------------------------------------------------

// Symbol-to-words conversion (duplicated from useTTS.ts, pure logic)
function symbolsToWords(code: string): string {
  return code
    .replace(/=>/g, ' arrow ')
    .replace(/===/g, ' strict equals ')
    .replace(/!==/g, ' not strict equals ')
    .replace(/==/g, ' equals ')
    .replace(/!=/g, ' not equals ')
    .replace(/&&/g, ' and ')
    .replace(/\|\|/g, ' or ')
    .replace(/<=/g, ' less than or equal ')
    .replace(/>=/g, ' greater than or equal ')
    .replace(/\+\+/g, ' increment ')
    .replace(/--/g, ' decrement ')
    .replace(/\.\.\./g, ' spread ')
}

// Function detection (duplicated from useTTS.ts, pure logic)
function detectFunctions(code: string): { name: string; params: string; line: number }[] {
  const functions: { name: string; params: string; line: number }[] = []
  const lines = code.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let match = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/)
    if (match) {
      functions.push({ name: match[1], params: match[2], line: i + 1 })
      continue
    }
    match = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/)
    if (match) {
      functions.push({ name: match[1], params: match[2], line: i + 1 })
      continue
    }
    match = line.match(/(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*\w+)?\s*\{/)
    if (match && !['if', 'for', 'while', 'switch', 'catch'].includes(match[1])) {
      functions.push({ name: match[1], params: match[2], line: i + 1 })
    }
  }

  return functions
}

// Import detection (duplicated from useTTS.ts, pure logic)
function detectImports(code: string): string[] {
  const imports: string[] = []
  const lines = code.split('\n')
  for (const line of lines) {
    const match = line.match(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/)
    if (match) {
      const names = match[1] || match[2]
      const from = match[3]
      imports.push(`${names.trim()} from ${from}`)
    }
  }
  return imports
}

// ============================================================================
// symbolsToWords
// ============================================================================

describe('symbolsToWords', () => {
  it('converts arrow function syntax', () => {
    expect(symbolsToWords('() => {}')).toBe('()  arrow  {}')
  })

  it('converts strict equality', () => {
    expect(symbolsToWords('a === b')).toBe('a  strict equals  b')
  })

  it('converts loose equality', () => {
    expect(symbolsToWords('a == b')).toBe('a  equals  b')
  })

  it('converts strict inequality', () => {
    expect(symbolsToWords('a !== b')).toBe('a  not strict equals  b')
  })

  it('converts loose inequality', () => {
    expect(symbolsToWords('a != b')).toBe('a  not equals  b')
  })

  it('converts logical AND', () => {
    expect(symbolsToWords('a && b')).toBe('a  and  b')
  })

  it('converts logical OR', () => {
    expect(symbolsToWords('a || b')).toBe('a  or  b')
  })

  it('converts less than or equal', () => {
    expect(symbolsToWords('a <= b')).toBe('a  less than or equal  b')
  })

  it('converts greater than or equal', () => {
    expect(symbolsToWords('a >= b')).toBe('a  greater than or equal  b')
  })

  it('converts increment', () => {
    expect(symbolsToWords('i++')).toBe('i increment ')
  })

  it('converts decrement', () => {
    expect(symbolsToWords('i--')).toBe('i decrement ')
  })

  it('converts spread operator', () => {
    expect(symbolsToWords('...args')).toBe(' spread args')
  })

  it('handles multiple symbols in one line', () => {
    const result = symbolsToWords('if (a === b && c !== d)')
    expect(result).toContain(' strict equals ')
    expect(result).toContain(' and ')
    expect(result).toContain(' not strict equals ')
  })

  it('leaves plain text unchanged', () => {
    expect(symbolsToWords('hello world')).toBe('hello world')
  })

  it('does not modify single = (assignment)', () => {
    expect(symbolsToWords('x = 5')).toBe('x = 5')
  })

  it('strict equality matched before loose equality', () => {
    // === should NOT become "= equals " — it should be " strict equals "
    const result = symbolsToWords('x === y')
    expect(result).not.toContain('= ')
    expect(result).toContain(' strict equals ')
  })
})

// ============================================================================
// detectFunctions
// ============================================================================

describe('detectFunctions', () => {
  it('detects a standard function declaration', () => {
    const code = 'function handleSubmit(event) {\n  // ...\n}'
    const fns = detectFunctions(code)
    expect(fns).toHaveLength(1)
    expect(fns[0]).toEqual({ name: 'handleSubmit', params: 'event', line: 1 })
  })

  it('detects an exported function', () => {
    const code = 'export function getData(id, options) {\n}'
    const fns = detectFunctions(code)
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('getData')
    expect(fns[0].params).toBe('id, options')
  })

  it('detects an async function', () => {
    const code = 'async function fetchUser(userId) {\n}'
    const fns = detectFunctions(code)
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('fetchUser')
  })

  it('detects an export async function', () => {
    const code = 'export async function loadData() {\n}'
    const fns = detectFunctions(code)
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('loadData')
    expect(fns[0].params).toBe('')
  })

  it('detects arrow functions assigned to const', () => {
    const code = 'const handleClick = (e) => {\n}'
    const fns = detectFunctions(code)
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('handleClick')
    expect(fns[0].params).toBe('e')
  })

  it('detects async arrow functions', () => {
    const code = 'const fetchData = async (url) => {\n}'
    const fns = detectFunctions(code)
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('fetchData')
  })

  it('detects exported arrow functions', () => {
    const code = 'export const processItem = (item) => {\n}'
    const fns = detectFunctions(code)
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('processItem')
  })

  it('detects class methods', () => {
    const code = 'class Foo {\n  doSomething(x, y) {\n  }\n}'
    const fns = detectFunctions(code)
    expect(fns.some(f => f.name === 'doSomething')).toBe(true)
  })

  it('ignores control flow keywords (if, for, while, switch, catch)', () => {
    const code = [
      'if (x) {',
      'for (let i = 0; i < 10; i++) {',
      'while (running) {',
      'switch (mode) {',
      'catch (err) {',
    ].join('\n')
    const fns = detectFunctions(code)
    expect(fns).toHaveLength(0)
  })

  it('detects multiple functions in one file', () => {
    const code = [
      'function a() {',
      '}',
      'const b = () => {',
      '}',
      'async function c(x) {',
      '}',
    ].join('\n')
    const fns = detectFunctions(code)
    expect(fns).toHaveLength(3)
    expect(fns.map(f => f.name)).toEqual(['a', 'b', 'c'])
  })

  it('reports correct line numbers', () => {
    const code = [
      '// comment',
      '',
      'function first() {',
      '}',
      '',
      'function second() {',
      '}',
    ].join('\n')
    const fns = detectFunctions(code)
    expect(fns[0]).toEqual({ name: 'first', params: '', line: 3 })
    expect(fns[1]).toEqual({ name: 'second', params: '', line: 6 })
  })

  it('returns empty array for code with no functions', () => {
    const code = 'const x = 5\nconst y = "hello"'
    expect(detectFunctions(code)).toHaveLength(0)
  })
})

// ============================================================================
// detectImports
// ============================================================================

describe('detectImports', () => {
  it('detects named imports', () => {
    const code = "import { useState, useEffect } from 'react'"
    const imports = detectImports(code)
    expect(imports).toHaveLength(1)
    expect(imports[0]).toBe('useState, useEffect from react')
  })

  it('detects default imports', () => {
    const code = "import React from 'react'"
    const imports = detectImports(code)
    expect(imports).toHaveLength(1)
    expect(imports[0]).toBe('React from react')
  })

  it('detects multiple import statements', () => {
    const code = [
      "import React from 'react'",
      "import { render } from 'react-dom'",
      "import styles from './App.css'",
    ].join('\n')
    const imports = detectImports(code)
    expect(imports).toHaveLength(3)
  })

  it('handles double-quoted imports', () => {
    const code = 'import { foo } from "bar"'
    const imports = detectImports(code)
    expect(imports).toHaveLength(1)
    expect(imports[0]).toBe('foo from bar')
  })

  it('returns empty array when no imports exist', () => {
    const code = 'const x = 5'
    expect(detectImports(code)).toHaveLength(0)
  })

  it('ignores require statements', () => {
    const code = "const fs = require('fs')"
    expect(detectImports(code)).toHaveLength(0)
  })
})
