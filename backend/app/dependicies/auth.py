import os
import secrets
from typing import Annotated, Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials

security = HTTPBasic(auto_error=False)

def get_current_user(
    request: Request,
    credentials: Annotated[Optional[HTTPBasicCredentials], Depends(security)]
):
    """
    Validates basic auth credentials against admin password from environment.
    Username must be 'admin' and password must match ADMIN_PASSWORD env var.
    """
    admin_password = os.getenv("ADMIN_PASSWORD")
    
    if not admin_password:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication not configured"
        )
    
    # If no credentials provided, return 401 without WWW-Authenticate header
    # This prevents browser popup and lets frontend handle it
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    
    is_correct_username = secrets.compare_digest(credentials.username, "admin")
    is_correct_password = secrets.compare_digest(credentials.password, admin_password)
    
    if not (is_correct_username and is_correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    
    return credentials.username