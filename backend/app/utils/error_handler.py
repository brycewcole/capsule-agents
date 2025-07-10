"""
Error handling utilities for the backend application.
"""
import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from backend.app.utils.exceptions import APIException, JSONRPCException
from backend.app.schemas import JSONRPCError, JSONRPCResponse

logger = logging.getLogger(__name__)

async def api_exception_handler(request: Request, exc: APIException):
    logger.error(f"API Exception: {exc.detail}", exc_info=True)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

async def json_rpc_exception_handler(request: Request, exc: JSONRPCException):
    logger.error(f"JSON-RPC Exception: {exc.message}", exc_info=True)
    return JSONResponse(
        status_code=200,
        content=JSONRPCResponse(
            id=None,
            error=JSONRPCError(code=exc.code, message=exc.message, data=exc.data),
        ).model_dump(mode="json", exclude_none=True),
    )