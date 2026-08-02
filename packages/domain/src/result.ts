export type Success<Value> = Readonly<{
  ok: true;
  value: Value;
}>;

export type Failure<ErrorValue> = Readonly<{
  ok: false;
  error: ErrorValue;
}>;

export type Result<Value, ErrorValue> = Success<Value> | Failure<ErrorValue>;

export function success<Value>(value: Value): Success<Value> {
  return {
    ok: true,
    value,
  };
}

export function failure<ErrorValue>(error: ErrorValue): Failure<ErrorValue> {
  return {
    ok: false,
    error,
  };
}

export function isSuccess<Value, ErrorValue>(
  result: Result<Value, ErrorValue>,
): result is Success<Value> {
  return result.ok;
}

export function isFailure<Value, ErrorValue>(
  result: Result<Value, ErrorValue>,
): result is Failure<ErrorValue> {
  return !result.ok;
}
