import { logger } from "./logger";

/**
 * 애플리케이션 에러 유형 정의
 */
export enum ErrorType {
  AUTHENTICATION = "AUTHENTICATION",
  NETWORK = "NETWORK",
  AI_SERVICE = "AI_SERVICE",
  AUTOMATION = "AUTOMATION",
  FILE_SYSTEM = "FILE_SYSTEM",
  VALIDATION = "VALIDATION",
  UNKNOWN = "UNKNOWN",
}

/**
 * 커스텀 애플리케이션 에러 클래스
 */
export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly code?: string;
  public readonly details?: any;
  public readonly timestamp: number;
  public readonly retryable: boolean;

  constructor(
    type: ErrorType,
    message: string,
    code?: string,
    details?: any,
    retryable: boolean = false
  ) {
    super(message);
    this.name = "AppError";
    this.type = type;
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
    this.retryable = retryable;

    // 스택 트레이스 유지
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * 에러 정보를 JSON으로 변환
   */
  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      retryable: this.retryable,
      stack: this.stack,
    };
  }

  /**
   * 사용자에게 보여줄 친절한 에러 메시지 생성
   */
  getUserFriendlyMessage(): string {
    switch (this.type) {
      case ErrorType.AUTHENTICATION:
        return "로그인이 필요하거나 세션이 만료되었습니다. 다시 로그인해주세요.";
      case ErrorType.NETWORK:
        return "네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인해주세요.";
      case ErrorType.AI_SERVICE:
        return "AI 서비스에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.";
      case ErrorType.AUTOMATION:
        return "브라우저 자동화 중 문제가 발생했습니다. 페이지를 새로고침 후 다시 시도해주세요.";
      case ErrorType.FILE_SYSTEM:
        return "파일 저장 또는 읽기 중 문제가 발생했습니다. 디스크 공간을 확인해주세요.";
      case ErrorType.VALIDATION:
        return "입력값이 올바르지 않습니다. 내용을 확인해주세요.";
      default:
        return "알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    }
  }
}

/**
 * 중앙 에러 핸들러 클래스
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorCallbacks: Array<(error: AppError) => void> = [];

  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * 에러 콜백 등록
   */
  public onError(callback: (error: AppError) => void): () => void {
    this.errorCallbacks.push(callback);

    // 구독 해제 함수 반환
    return () => {
      const index = this.errorCallbacks.indexOf(callback);
      if (index > -1) {
        this.errorCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 에러 처리 및 로깅
   */
  public handleError(error: Error | AppError, context?: string): AppError {
    // 이미 AppError 인스턴스가 아니면 변환
    const appError =
      error instanceof AppError ? error : this.convertToAppError(error);

    // 컨텍스트 정보 추가
    if (context) {
      // 기존 details와 병합하여 새 객체 생성
      const updatedDetails = {
        ...(appError.details || {}),
        context,
      };

      // 새 AppError 인스턴스 생성 (details는 readonly이므로)
      const updatedError = new AppError(
        appError.type,
        appError.message,
        appError.code,
        updatedDetails,
        appError.retryable
      );

      // 스택 트레이스 복사
      updatedError.stack = appError.stack;

      // 로깅
      logger.error(`[${updatedError.type}] ${updatedError.message}`, {
        code: updatedError.code,
        details: updatedError.details,
        stack: updatedError.stack,
      });

      // 등록된 콜백들 실행
      this.errorCallbacks.forEach((callback) => {
        try {
          callback(updatedError);
        } catch (callbackError) {
          logger.error("Error in error callback:", callbackError);
        }
      });

      return updatedError;
    }

    // 로깅
    logger.error(`[${appError.type}] ${appError.message}`, {
      code: appError.code,
      details: appError.details,
      stack: appError.stack,
    });

    // 등록된 콜백들 실행
    this.errorCallbacks.forEach((callback) => {
      try {
        callback(appError);
      } catch (callbackError) {
        logger.error("Error in error callback:", callbackError);
      }
    });

    return appError;
  }

  /**
   * 일반 Error를 AppError로 변환
   */
  private convertToAppError(error: Error): AppError {
    // 이미 AppError인 경우 그대로 반환
    if (error instanceof AppError) {
      return error;
    }

    // 네트워크 에러
    if (
      error.message.includes("fetch") ||
      error.message.includes("network") ||
      error.message.includes("ECONNREFUSED")
    ) {
      return new AppError(
        ErrorType.NETWORK,
        `네트워크 오류: ${error.message}`,
        "NETWORK_ERROR",
        { originalError: error.message },
        true
      );
    }

    // 타임아웃 에러
    if (
      error.message.includes("timeout") ||
      error.message.includes("TimeoutError")
    ) {
      return new AppError(
        ErrorType.AUTOMATION,
        `작업 시간 초과: ${error.message}`,
        "TIMEOUT_ERROR",
        { originalError: error.message },
        true
      );
    }

    // JSON 파싱 에러
    if (
      error.message.includes("JSON") ||
      error.message.includes("SyntaxError")
    ) {
      return new AppError(
        ErrorType.AI_SERVICE,
        `데이터 처리 오류: ${error.message}`,
        "PARSE_ERROR",
        { originalError: error.message }
      );
    }

    // 파일 시스템 에러
    if (
      error.message.includes("ENOENT") ||
      error.message.includes("EACCES") ||
      error.message.includes("file system")
    ) {
      return new AppError(
        ErrorType.FILE_SYSTEM,
        `파일 시스템 오류: ${error.message}`,
        "FILE_ERROR",
        { originalError: error.message }
      );
    }

    // 기타 알 수 없는 에러
    return new AppError(
      ErrorType.UNKNOWN,
      `알 수 없는 오류: ${error.message}`,
      "UNKNOWN_ERROR",
      { originalError: error.message, stack: error.stack }
    );
  }

  /**
   * 재시도 로직이 포함된 에러 핸들러
   */
  public async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
    context?: string
  ): Promise<T> {
    let lastError: AppError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.handleError(
          error,
          `${context} (시도 ${attempt}/${maxRetries})`
        );

        // 재시도 가능하지 않은 에러이거나 마지막 시도인 경우 즉시 실패
        if (!lastError.retryable || attempt === maxRetries) {
          throw lastError;
        }

        // 지수 백오프로 대기
        const waitTime = delay * Math.pow(2, attempt - 1);
        logger.info(`${attempt}번 재시도 실패, ${waitTime}ms 후 재시도...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    throw lastError!;
  }
}

/**
 * 전역 에러 핸들러 인스턴스
 */
export const errorHandler = ErrorHandler.getInstance();

/**
 * 편의 함수: 에러 핸들링
 */
export const handleError = (error: Error, context?: string): AppError => {
  return errorHandler.handleError(error, context);
};

/**
 * 편의 함수: 재시도 로직
 */
export const withRetry = <T>(
  operation: () => Promise<T>,
  maxRetries?: number,
  delay?: number,
  context?: string
): Promise<T> => {
  return errorHandler.withRetry(operation, maxRetries, delay, context);
};
