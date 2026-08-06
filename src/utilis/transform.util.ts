import { BadRequestException } from "@nestjs/common";

export function parseArrayOrJson(value: any): any {
  if (typeof value !== 'string') {
    return value;
  }

  if (!value.trim()) {
    return [];
  }

  // إذا بدأ بـ [ يبقى غالبًا JSON Array
  if (value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);

      if (!Array.isArray(parsed)) {
        throw new BadRequestException('Value must be an array');
      }

      return parsed;
    } catch {
      throw new BadRequestException('Invalid array format');
    }
  }

  // غير JSON → اعتبره comma separated
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    const parsed = JSON.parse(value);

    return parsed !== null ? parsed : value;
  } catch {
    return value;
  }
}