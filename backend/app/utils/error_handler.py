"""
Error handling utilities for the backend application.
"""

import logging
from typing import Optional, Dict, Any
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from backend.app.schemas import (
    JSONRPCError,
    JSONRPCResponse,
    EnhancedJSONRPCError,
    create_user_friendly_error,
    InternalError,
    ValidationError as JSONRPCValidationError,
    AuthenticationError,
    AuthorizationError,
    RateLimitError,
    ServiceUnavailableError,
    InvalidSessionError,
    ConfigurationError,
    ResourceNotFoundError,
    TimeoutError,
    NetworkError,
)

logger = logging.getLogger(__name__)


class ErrorHandler:
    """Centralized error handling for the application"""
    
    @staticmethod
    def handle_exception(
        exc: Exception,
        request_id: Optional[str] = None,
        enhance_for_user: bool = True
    ) -> JSONRPCResponse:
        """
        Handle any exception and convert it to a JSON-RPC error response.
        
        Args:
            exc: The exception to handle
            request_id: Optional request ID for the response
            enhance_for_user: Whether to enhance the error for user-friendly display
            
        Returns:
            JSONRPCResponse with appropriate error information
        """
        logger.error(f"Handling exception: {exc}", exc_info=True)
        
        # Map common exceptions to JSON-RPC errors
        if isinstance(exc, HTTPException):
            error = ErrorHandler._http_exception_to_jsonrpc_error(exc)
        elif isinstance(exc, ValueError):
            error = JSONRPCValidationError(message=str(exc))
        elif isinstance(exc, PermissionError):
            error = AuthorizationError(message=str(exc))
        elif isinstance(exc, TimeoutError):
            error = TimeoutError(message=str(exc))
        elif isinstance(exc, ConnectionError):
            error = NetworkError(message=str(exc))
        elif isinstance(exc, FileNotFoundError):
            error = ResourceNotFoundError(message=str(exc))
        else:
            # Generic internal error for unknown exceptions
            error = InternalError(message=str(exc))
        
        # Enhance for user-friendly display if requested
        if enhance_for_user:
            error = create_user_friendly_error(error)
        
        return JSONRPCResponse(
            id=request_id,
            error=error.to_dict() if isinstance(error, EnhancedJSONRPCError) else error
        )
    
    @staticmethod
    def _http_exception_to_jsonrpc_error(exc: HTTPException) -> JSONRPCError:
        """Convert HTTPException to appropriate JSON-RPC error"""
        status_code = exc.status_code
        
        if status_code == 401:
            return AuthenticationError(message=str(exc.detail))
        elif status_code == 403:
            return AuthorizationError(message=str(exc.detail))
        elif status_code == 404:
            return ResourceNotFoundError(message=str(exc.detail))
        elif status_code == 422:
            return JSONRPCValidationError(message=str(exc.detail))
        elif status_code == 429:
            return RateLimitError(message=str(exc.detail))
        elif status_code == 503:
            return ServiceUnavailableError(message=str(exc.detail))
        else:
            return InternalError(message=str(exc.detail))
    
    @staticmethod
    def create_error_response(
        error: JSONRPCError,
        request_id: Optional[str] = None,
        status_code: int = 400
    ) -> JSONResponse:
        """
        Create a JSON response for an error.
        
        Args:
            error: The JSON-RPC error to return
            request_id: Optional request ID
            status_code: HTTP status code for the response
            
        Returns:
            JSONResponse with the error
        """
        enhanced_error = create_user_friendly_error(error)
        response = JSONRPCResponse(
            id=request_id,
            error=enhanced_error.to_dict()
        )
        
        return JSONResponse(
            status_code=status_code,
            content=response.model_dump(mode="json", exclude_none=True)
        )
    
    @staticmethod
    def get_http_status_for_error_code(error_code: int) -> int:
        """Map JSON-RPC error codes to HTTP status codes"""
        error_to_status = {
            -32700: 400,  # Parse error
            -32600: 400,  # Invalid request
            -32601: 404,  # Method not found
            -32602: 400,  # Invalid params
            -32603: 500,  # Internal error
            -32001: 404,  # Task not found
            -32002: 400,  # Task not cancelable
            -32003: 501,  # Push notifications not supported
            -32004: 501,  # Operation not supported
            -32005: 415,  # Content type not supported
            -32006: 401,  # Authentication required
            -32007: 403,  # Insufficient permissions
            -32008: 429,  # Rate limit exceeded
            -32009: 503,  # Service unavailable
            -32010: 401,  # Invalid session
            -32011: 500,  # Configuration error
            -32012: 404,  # Resource not found
            -32013: 422,  # Validation failed
            -32014: 408,  # Request timeout
            -32015: 502,  # Network error
        }
        
        return error_to_status.get(error_code, 500)


# Convenience functions for common errors
def create_validation_error(message: str, field: str = None) -> EnhancedJSONRPCError:
    """Create a validation error with optional field context"""
    data = {"field": field} if field else None
    return EnhancedJSONRPCError(
        code=-32013,
        message=message,
        data=data,
        user_message=f"Please check your input{f' for {field}' if field else ''} and try again",
        recovery_action="Correct the input and resubmit"
    )


def create_auth_error(message: str = "Authentication required") -> EnhancedJSONRPCError:
    """Create an authentication error"""
    return EnhancedJSONRPCError(
        code=-32006,
        message=message,
        user_message="Please log in to continue",
        recovery_action="Log in with your credentials"
    )


def create_permission_error(message: str = "Insufficient permissions") -> EnhancedJSONRPCError:
    """Create a permission error"""
    return EnhancedJSONRPCError(
        code=-32007,
        message=message,
        user_message="You don't have permission to perform this action",
        recovery_action="Contact an administrator if you believe this is incorrect"
    )


def create_rate_limit_error(message: str = "Rate limit exceeded") -> EnhancedJSONRPCError:
    """Create a rate limit error"""
    return EnhancedJSONRPCError(
        code=-32008,
        message=message,
        user_message="Too many requests. Please wait a moment and try again",
        recovery_action="Wait a few moments before retrying"
    )


def create_service_unavailable_error(message: str = "Service temporarily unavailable") -> EnhancedJSONRPCError:
    """Create a service unavailable error"""
    return EnhancedJSONRPCError(
        code=-32009,
        message=message,
        user_message="The service is temporarily unavailable. Please try again later",
        recovery_action="Try again in a few minutes"
    )


def create_timeout_error(message: str = "Request timeout") -> EnhancedJSONRPCError:
    """Create a timeout error"""
    return EnhancedJSONRPCError(
        code=-32014,
        message=message,
        user_message="The request took too long. Please try again",
        recovery_action="Try again or simplify your request"
    )