import { BoundaryValue } from '../types';

export interface FieldConfig {
  name: string;
  type: 'text' | 'email' | 'password' | 'number' | 'date' | 'phone' | 'url';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  required?: boolean;
}

export function generateBoundaryValues(field: FieldConfig): BoundaryValue[] {
  const values: BoundaryValue[] = [];

  switch (field.type) {
    case 'number': {
      const min = field.min ?? 0;
      const max = field.max ?? 100;
      values.push({ label: 'Empty', value: '', type: 'empty' });
      values.push({ label: `Min (${min})`, value: min, type: 'min' });
      values.push({ label: `Min-1 (${min - 1})`, value: min - 1, type: 'boundary_min' });
      values.push({ label: `Min+1 (${min + 1})`, value: min + 1, type: 'boundary_max' });
      values.push({ label: `Typical (${Math.floor((min + max) / 2)})`, value: Math.floor((min + max) / 2), type: 'typical' });
      values.push({ label: `Max-1 (${max - 1})`, value: max - 1, type: 'boundary_min' });
      values.push({ label: `Max (${max})`, value: max, type: 'max' });
      values.push({ label: `Max+1 (${max + 1})`, value: max + 1, type: 'boundary_max' });
      values.push({ label: 'Special: 0', value: 0, type: 'special' });
      values.push({ label: 'Special: -1', value: -1, type: 'special' });
      values.push({ label: 'Special: 999999', value: 999999, type: 'special' });
      break;
    }

    case 'text': {
      const minLen = field.minLength ?? 1;
      const maxLen = field.maxLength ?? 255;
      values.push({ label: 'Empty', value: '', type: 'empty' });
      values.push({ label: 'Single char', value: 'a', type: 'boundary_min' });
      values.push({ label: `Min length (${minLen})`, value: 'a'.repeat(minLen), type: 'min' });
      values.push({ label: `Min-1 length`, value: 'a'.repeat(Math.max(0, minLen - 1)), type: 'boundary_min' });
      values.push({ label: 'Typical (hello world)', value: 'hello world', type: 'typical' });
      values.push({ label: `Max length (${maxLen})`, value: 'a'.repeat(maxLen), type: 'max' });
      values.push({ label: `Max+1 length`, value: 'a'.repeat(maxLen + 1), type: 'boundary_max' });
      values.push({ label: 'Special chars', value: '!@#$%^&*()', type: 'special' });
      values.push({ label: 'SQL Injection', value: "'; DROP TABLE users; --", type: 'special' });
      values.push({ label: 'XSS', value: '<script>alert(1)</script>', type: 'special' });
      values.push({ label: 'Unicode', value: '你好世界 مرحبا', type: 'special' });
      values.push({ label: 'Whitespace only', value: '   ', type: 'special' });
      break;
    }

    case 'email': {
      values.push({ label: 'Empty', value: '', type: 'empty' });
      values.push({ label: 'Valid email', value: 'test@example.com', type: 'typical' });
      values.push({ label: 'No @ symbol', value: 'testexample.com', type: 'special' });
      values.push({ label: 'No domain', value: 'test@', type: 'special' });
      values.push({ label: 'Multiple @', value: 'test@@example.com', type: 'special' });
      values.push({ label: 'Long email', value: `${'a'.repeat(64)}@${'b'.repeat(63)}.com`, type: 'max' });
      values.push({ label: 'Special chars in local', value: 'test+filter@example.com', type: 'special' });
      values.push({ label: 'Subdomain', value: 'user@mail.example.com', type: 'typical' });
      values.push({ label: 'Unicode domain', value: 'user@例え.jp', type: 'special' });
      break;
    }

    case 'password': {
      values.push({ label: 'Empty', value: '', type: 'empty' });
      values.push({ label: 'Too short (1 char)', value: 'a', type: 'boundary_min' });
      values.push({ label: 'Min (8 chars)', value: 'Passw0rd', type: 'min' });
      values.push({ label: 'No uppercase', value: 'password123!', type: 'special' });
      values.push({ label: 'No number', value: 'Password!!!', type: 'special' });
      values.push({ label: 'No special char', value: 'Password123', type: 'special' });
      values.push({ label: 'All special', value: '!@#$%^&*()', type: 'special' });
      values.push({ label: 'Strong password', value: 'Str0ng@Pass!2024', type: 'typical' });
      values.push({ label: 'Max length (128)', value: `${'Aa1!'.repeat(32)}`, type: 'max' });
      values.push({ label: 'Space in password', value: 'Pass word 1!', type: 'special' });
      break;
    }

    case 'phone': {
      values.push({ label: 'Empty', value: '', type: 'empty' });
      values.push({ label: 'Valid US', value: '+1-555-555-5555', type: 'typical' });
      values.push({ label: 'Valid India', value: '+91-9876543210', type: 'typical' });
      values.push({ label: 'Too short', value: '123', type: 'boundary_min' });
      values.push({ label: 'Too long', value: '12345678901234567890', type: 'boundary_max' });
      values.push({ label: 'Letters included', value: 'ABC-DEF-GHIJ', type: 'special' });
      values.push({ label: 'No country code', value: '9876543210', type: 'special' });
      values.push({ label: 'All zeros', value: '0000000000', type: 'special' });
      break;
    }

    case 'date': {
      const now = new Date();
      values.push({ label: 'Empty', value: '', type: 'empty' });
      values.push({ label: 'Today', value: now.toISOString().split('T')[0], type: 'typical' });
      values.push({ label: 'Yesterday', value: new Date(now.getTime() - 86400000).toISOString().split('T')[0], type: 'boundary_min' });
      values.push({ label: 'Tomorrow', value: new Date(now.getTime() + 86400000).toISOString().split('T')[0], type: 'boundary_max' });
      values.push({ label: 'Leap day 2024', value: '2024-02-29', type: 'special' });
      values.push({ label: 'Invalid date', value: '2024-13-45', type: 'special' });
      values.push({ label: 'Far past', value: '1900-01-01', type: 'min' });
      values.push({ label: 'Far future', value: '9999-12-31', type: 'max' });
      break;
    }

    case 'url': {
      values.push({ label: 'Empty', value: '', type: 'empty' });
      values.push({ label: 'Valid HTTP', value: 'http://example.com', type: 'typical' });
      values.push({ label: 'Valid HTTPS', value: 'https://example.com', type: 'typical' });
      values.push({ label: 'No protocol', value: 'example.com', type: 'special' });
      values.push({ label: 'With path', value: 'https://example.com/path?q=1', type: 'typical' });
      values.push({ label: 'Localhost', value: 'http://localhost:3000', type: 'special' });
      values.push({ label: 'Invalid URL', value: 'not a url!!!', type: 'special' });
      values.push({ label: 'Very long URL', value: `https://example.com/${'a'.repeat(2000)}`, type: 'max' });
      break;
    }
  }

  return values;
}

export function getBoundaryTestCode(fieldSelector: string, values: BoundaryValue[], timeout = 500): string {
  return values.map(v => `
  // Boundary: ${v.label}
  await page.fill('${fieldSelector}', '${String(v.value).replace(/'/g, "\\'")}');
  await page.waitForTimeout(${timeout});`).join('');
}
