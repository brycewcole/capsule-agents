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
    MCPServerError,
    MCPToolError,
    MCPConfigurationError,
    A2AAgentError,
    A2AAgentNotFoundError,
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
            # Check for MCP-specific errors
            error = ErrorHandler._detect_mcp_errors(exc)
            if error is None:
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
    def _detect_mcp_errors(exc: Exception) -> Optional[JSONRPCError]:
        """Detect MCP-specific and A2A agent errors from exception messages and stack traces"""
        exc_str = str(exc).lower()
        exc_type = type(exc).__name__
        
        logger.info(f"Detecting error type for {exc_type}: {exc_str[:200]}...")
        
        # Get the full stack trace for pattern matching
        import traceback
        stack_trace = traceback.format_exception(type(exc), exc, exc.__traceback__)
        full_trace = ''.join(stack_trace).lower()
        
        # A2A agent 404 errors
        if (exc_type == 'HTTPStatusError' and '404' in exc_str) or ('404 not found' in exc_str):
            return A2AAgentNotFoundError(message="A2A agent endpoint not found")
        
        # A2A agent connection errors
        if any(pattern in exc_str for pattern in [
            'workers.dev',
            'a2a agent',
            'agent endpoint'
        ]) and any(error_type in exc_str for error_type in [
            'connection',
            'timeout',
            'unreachable',
            'failed'
        ]):
            return A2AAgentError(message="Cannot connect to A2A agent")
        
        # HTTP status errors that might be MCP related
        if exc_type == 'HTTPStatusError':
            is_mcp_related = (any(mcp_pattern in exc_str for mcp_pattern in ['mcp', 'localhost', '127.0.0.1']) or 
                            any(mcp_pattern in full_trace for mcp_pattern in ['mcp', 'mcptoolset']))
            logger.info(f"HTTPStatusError detected. MCP-related: {is_mcp_related}")
            
            if is_mcp_related:
                if '301' in exc_str or '302' in exc_str or 'redirect' in exc_str:
                    error = MCPConfigurationError(message="MCP server URL redirected - check configuration")
                    logger.info(f"Detected MCP redirect error: {error.code}")
                    return error
                elif '404' in exc_str:
                    error = MCPServerError(message="MCP server endpoint not found")
                    logger.info(f"Detected MCP 404 error: {error.code}")
                    return error
                elif '500' in exc_str or '502' in exc_str or '503' in exc_str:
                    error = MCPServerError(message="MCP server is having issues")
                    logger.info(f"Detected MCP server error: {error.code}")
                    return error
                else:
                    error = MCPServerError(message="MCP server returned HTTP error")
                    logger.info(f"Detected generic MCP HTTP error: {error.code}")
                    return error
        
        # MCP connection errors - improved patterns
        mcp_connection_patterns = [
            'mcp/client/sse.py',
            'mcptoolset.from_server',
            'all connection attempts failed',
            'httpx.connecterror',
            'connection refused',
            'name or service not known',
            'no route to host'
        ]
        
        if any(pattern in full_trace for pattern in mcp_connection_patterns):
            return MCPServerError(message="Cannot connect to MCP server")
        
        # MCP server not found (404, connection refused, etc.)
        if any(pattern in exc_str for pattern in ['connection refused', 'name or service not known']) and 'mcp' in full_trace:
            return MCPServerError(message="MCP server is not running or accessible")
        
        # MCP configuration errors
        if any(pattern in full_trace for pattern in [
            'sseserverparams',
            'mcp server configuration',
            'invalid mcp url',
            'mcp_tool/mcp_toolset.py'
        ]):
            return MCPConfigurationError(message="MCP server configuration is invalid")
        
        # MCP tool execution errors
        if any(pattern in full_trace for pattern in [
            'mcp tool execution',
            'tool not found',
            'mcp method not supported'
        ]):
            return MCPToolError(message="MCP tool operation failed")
        
        # Generic connection errors that might be MCP-related
        if exc_type in ['ConnectError', 'ConnectionError']:
            # Check if URL looks like MCP server
            if any(pattern in exc_str for pattern in ['localhost', '127.0.0.1', 'mcp']):
                error = MCPServerError(message="MCP server is not reachable")
                logger.info(f"Detected MCP connection error: {error.code}")
                return error
            # Check if URL looks like A2A agent
            elif any(pattern in exc_str for pattern in ['workers.dev', 'agent']):
                error = A2AAgentError(message="A2A agent is not reachable")
                logger.info(f"Detected A2A connection error: {error.code}")
                return error
        
        logger.info(f"No specific error pattern detected for {exc_type}")
        return None
    
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
            -32016: 502,  # MCP server error
            -32017: 500,  # MCP tool error
            -32018: 500,  # MCP configuration error
            -32019: 502,  # A2A agent error
            -32020: 404,  # A2A agent not found
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


def create_mcp_server_error(server_url: str = "", message: str = "MCP server connection failed") -> EnhancedJSONRPCError:
    """Create an MCP server connection error"""
    return EnhancedJSONRPCError(
        code=-32016,
        message=message,
        data={"server_url": server_url} if server_url else None,
        user_message="MCP server is not available",
        recovery_action="Check if the MCP server is running and accessible"
    )


def create_a2a_agent_error(agent_url: str = "", message: str = "A2A agent connection failed") -> EnhancedJSONRPCError:
    """Create an A2A agent connection error"""
    return EnhancedJSONRPCError(
        code=-32019,
        message=message,
        data={"agent_url": agent_url} if agent_url else None,
        user_message="A2A agent is not reachable",
        recovery_action="Check the agent URL and network connection"
    )


def create_a2a_agent_not_found_error(agent_url: str = "", message: str = "A2A agent not found") -> EnhancedJSONRPCError:
    """Create an A2A agent not found error"""
    return EnhancedJSONRPCError(
        code=-32020,
        message=message,
        data={"agent_url": agent_url} if agent_url else None,
        user_message="A2A agent endpoint not found",
        recovery_action="Verify the URL and agent deployment"
    )