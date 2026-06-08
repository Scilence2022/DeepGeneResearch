import { type APICallError } from "ai";
import { isString, isObject } from "radash";

interface ErrorEnvelope {
  error?: unknown;
}

interface ResponseBodyError {
  error?: {
    code?: number | string;
    message?: string;
    status?: string;
    type?: string;
  };
  message?: string;
}

function isErrorEnvelope(err: unknown): err is ErrorEnvelope {
  return isObject(err) && "error" in err;
}

function isApiCallError(err: unknown): err is APICallError {
  return isObject(err) && ("responseBody" in err || "message" in err);
}

function formatResponseBody(responseBody: string): string | undefined {
  try {
    const response = JSON.parse(responseBody) as ResponseBodyError;
    const responseError = response.error;

    if (responseError?.message) {
      const status =
        responseError.status ?? responseError.code ?? responseError.type;
      return status
        ? `[${status}]: ${responseError.message}`
        : responseError.message;
    }

    if (response.message) {
      return response.message;
    }
  } catch {
    return responseBody;
  }
}

export function parseError(err: unknown): string {
  let errorMessage: string = "Unknown Error";
  if (isString(err)) errorMessage = err;
  if (isObject(err)) {
    const error = isErrorEnvelope(err) ? err.error : err;

    if (isApiCallError(error)) {
      if (isString(error.responseBody)) {
        errorMessage = formatResponseBody(error.responseBody) ?? errorMessage;
      }

      if (errorMessage === "Unknown Error" && isString(error.message)) {
        errorMessage = error.name
          ? `[${error.name}]: ${error.message}`
          : error.message;
      }
    } else if (error instanceof Error) {
      errorMessage = error.name
        ? `[${error.name}]: ${error.message}`
        : error.message;
    }
  }
  return errorMessage;
}
