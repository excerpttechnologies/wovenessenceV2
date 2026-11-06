import crypto from 'node:crypto';
import mongodb from 'mongodb';

const { BSON } = mongodb;
const { EJSON } = BSON;

/** Stable key for an _id, preserving its BSON type. */
export function idKey(value) {
  return EJSON.stringify(value, { relaxed: false });
}

/** EJSON round-trip used by the resume checkpoint. */
export function encodeId(value) {
  return EJSON.stringify(value, { relaxed: false });
}

export function decodeId(text) {
  return EJSON.parse(text, { relaxed: false });
}

function numberKey(value) {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  if (Object.is(value, -0)) return '-0';
  return String(value);
}

/**
 * Canonical, key-order-independent representation of a BSON document.
 * Tags every BSON scalar so an ObjectId can never compare equal to its hex
 * string, a Decimal128 to a double, or a Long to an Int32.
 */
export function canonical(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const type = typeof value;
  if (type === 'string') return 's:' + JSON.stringify(value);
  if (type === 'number') return 'n:' + numberKey(value);
  if (type === 'boolean') return 'b:' + value;
  if (type === 'bigint') return 'big:' + value.toString();
  if (type === 'function') return 'fn';
  if (type === 'symbol') return 'sym:' + String(value);

  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value instanceof Date) return 'date:' + value.toISOString();
  if (value instanceof RegExp) return 'regex:' + value.source + '/' + value.flags;
  if (Buffer.isBuffer(value)) return 'buffer:' + value.toString('base64');
  if (value instanceof Uint8Array) return 'uint8:' + Buffer.from(value).toString('base64');

  if (value && typeof value._bsontype === 'string') {
    switch (value._bsontype) {
      case 'ObjectId':
      case 'ObjectID':
        return 'oid:' + value.toHexString();
      case 'Decimal128':
        return 'decimal:' + value.toString();
      case 'Long':
        return 'long:' + value.toString();
      case 'Int32':
        return 'int32:' + numberKey(value.value);
      case 'Double':
        return 'double:' + numberKey(value.value);
      case 'Binary': {
        const bytes = Buffer.from(value.buffer || value.value || []);
        return 'binary:' + value.sub_type + ':' + bytes.toString('base64');
      }
      case 'Timestamp':
        return 'timestamp:' + value.high + ':' + value.low;
      case 'Code':
        return 'code:' + JSON.stringify(value.code) + ':' + canonical(value.scope || null);
      case 'BSONRegExp':
        return 'bsonregex:' + value.pattern + '/' + value.options;
      case 'DBRef':
        return 'dbref:' + value.collection + ':' + value.oid + ':' + (value.db || '');
      case 'MinKey':
      case 'MaxKey':
      case 'BSONSymbol':
        return value._bsontype + ':' + (value.value ?? '');
      case 'UUID':
        return 'uuid:' + value.toHexString();
      default:
        try {
          return 'bson:' + value._bsontype + ':' + EJSON.stringify(value, { relaxed: false });
        } catch {
          return 'bson:' + value._bsontype + ':' + String(value);
        }
    }
  }

  if (type === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return type + ':' + String(value);
}

export function bsonHash(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

/** Human-readable field-level diff for a conflict report. */
export function describeDifference(sourceDoc, targetDoc) {
  const sourceKeys = new Set(Object.keys(sourceDoc));
  const targetKeys = new Set(Object.keys(targetDoc));
  const onlySource = [...sourceKeys].filter((k) => !targetKeys.has(k));
  const onlyTarget = [...targetKeys].filter((k) => !sourceKeys.has(k));
  const changed = [...sourceKeys].filter((k) => targetKeys.has(k) && canonical(sourceDoc[k]) !== canonical(targetDoc[k]));
  return { onlySource, onlyTarget, changed };
}
