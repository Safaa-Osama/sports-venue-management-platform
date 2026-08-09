import { plainToInstance, Transform } from 'class-transformer';
import { parseArrayOrJson, parseJson } from '../../utilis/transform.util'

export function ParseArray() {
  return Transform(({ value }) => {
    const result = parseArrayOrJson(value);
    return result});
}

export function ParseByJson(dtoClass?: any) {
  return Transform(({ value }) => {
    const parsed = parseJson(value);
    if (dtoClass && Array.isArray(parsed)) {
      return plainToInstance(dtoClass, parsed);
    }
    if (dtoClass && typeof parsed === 'object' && parsed !== null) {
      return plainToInstance(dtoClass, parsed);
    }
    return parsed;
  });
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