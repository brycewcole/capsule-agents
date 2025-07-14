from fastapi import HTTPException
from typing import Any

class APIException(HTTPException):
    def __init__(self, status_code: int, detail: str):
        super().__init__(status_code=status_code, detail=detail)

class JSONRPCException(Exception):
    code: int
    message: str
    data: Any | None

    def __init__(self, code: int, message: str, data: Any | None = None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(message)