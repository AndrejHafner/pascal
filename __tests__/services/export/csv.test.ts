import { csvField, csvRow } from '../../../src/services/export/csv'

describe('csvField', () => {
  it('passes through a plain string unquoted', () => {
    expect(csvField('hello')).toBe('hello')
  })

  it('passes through a number unquoted', () => {
    expect(csvField(42)).toBe('42')
    expect(csvField(3.14)).toBe('3.14')
  })

  it('null becomes an empty field', () => {
    expect(csvField(null)).toBe('')
  })

  it('quotes a field containing a comma', () => {
    expect(csvField('a,b')).toBe('"a,b"')
  })

  it('quotes a field containing a double quote and doubles the quote', () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
  })

  it('quotes a field containing a newline', () => {
    expect(csvField('line1\nline2')).toBe('"line1\nline2"')
  })

  it('a plain exercise name with no special characters is not quoted', () => {
    expect(csvField('20mm edge')).toBe('20mm edge')
  })

  it('an exercise name containing a comma IS quoted (the exact bug class from historyQueries)', () => {
    expect(csvField('20mm edge, half crimp')).toBe('"20mm edge, half crimp"')
  })
})

describe('csvRow', () => {
  it('joins fields with commas and ends with CRLF', () => {
    expect(csvRow(['a', 'b', 'c'])).toBe('a,b,c\r\n')
  })

  it('escapes individual fields within the row', () => {
    expect(csvRow(['a,b', 'c'])).toBe('"a,b",c\r\n')
  })

  it('handles a mix of strings, numbers, and nulls', () => {
    expect(csvRow(['x', 1, null, 2.5])).toBe('x,1,,2.5\r\n')
  })
})
