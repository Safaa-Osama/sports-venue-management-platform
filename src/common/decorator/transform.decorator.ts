import { Transform } from 'class-transformer';
import { parseArrayOrJson, parseJson } from '../../utilis/transform.util'

export function ParseArray() {
  return Transform(({ value }) => {
    const result = parseArrayOrJson(value);
    return result});
}

export function ParseByJson() {
  return Transform(({ value }) => parseJson(value));
}

export function ParseBoolean() {
  return Transform(({ value }) => {
    if (value === 'true' || value === true) {
      return true;
    }

    if (value === 'false' || value === false) {
      return false;
    }

    return value;
  });
}