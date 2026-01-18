"""
Authentication module for API requests.
Supports multiple authentication methods: Bearer token, API key, Basic auth.
"""
from typing import Dict, Optional
from utils import get_env_var


class AuthHandler:
    """Handles various authentication methods for API requests."""
    
    def __init__(self):
        """Initialize auth handler."""
        self.auth_type: Optional[str] = None
        self.credentials: Dict[str, str] = {}
    
    def set_bearer_token(self, token: Optional[str] = None, token_env: Optional[str] = None) -> None:
        """
        Set Bearer token authentication.
        
        Args:
            token: Direct token value
            token_env: Environment variable name containing token
        """
        self.auth_type = "bearer"
        if token:
            self.credentials["token"] = token
        elif token_env:
            token_value = get_env_var(token_env)
            if token_value:
                self.credentials["token"] = token_value
            else:
                raise ValueError(f"Environment variable '{token_env}' not found")
        else:
            raise ValueError("Either token or token_env must be provided")
    
    def set_api_key(
        self, 
        api_key: Optional[str] = None, 
        key_env: Optional[str] = None,
        header_name: str = "X-API-Key"
    ) -> None:
        """
        Set API Key authentication.
        
        Args:
            api_key: Direct API key value
            key_env: Environment variable name containing API key
            header_name: Header name for the API key (default: X-API-Key)
        """
        self.auth_type = "api_key"
        self.credentials["header_name"] = header_name
        
        if api_key:
            self.credentials["api_key"] = api_key
        elif key_env:
            key_value = get_env_var(key_env)
            if key_value:
                self.credentials["api_key"] = key_value
            else:
                raise ValueError(f"Environment variable '{key_env}' not found")
        else:
            raise ValueError("Either api_key or key_env must be provided")
    
    def set_basic_auth(self, username: str, password: str) -> None:
        """
        Set Basic authentication.
        
        Args:
            username: Username
            password: Password
        """
        self.auth_type = "basic"
        self.credentials["username"] = username
        self.credentials["password"] = password
    
    def get_auth_headers(self) -> Dict[str, str]:
        """
        Get authentication headers for the request.
        
        Returns:
            Dictionary of authentication headers
        """
        if self.auth_type == "bearer":
            token = self.credentials.get("token", "")
            return {"Authorization": f"Bearer {token}"}
        
        elif self.auth_type == "api_key":
            header_name = self.credentials.get("header_name", "X-API-Key")
            api_key = self.credentials.get("api_key", "")
            return {header_name: api_key}
        
        elif self.auth_type == "basic":
            # Basic auth is handled differently in requests library
            # We'll return empty dict and handle it separately in runner
            return {}
        
        return {}
    
    def get_basic_auth_tuple(self) -> Optional[tuple]:
        """
        Get Basic auth tuple for requests library.
        
        Returns:
            Tuple of (username, password) or None
        """
        if self.auth_type == "basic":
            username = self.credentials.get("username")
            password = self.credentials.get("password")
            if username and password:
                return (username, password)
        return None
    
    def is_configured(self) -> bool:
        """
        Check if authentication is configured.
        
        Returns:
            True if auth is configured, False otherwise
        """
        return self.auth_type is not None and bool(self.credentials)
    
    def get_auth_type(self) -> Optional[str]:
        """
        Get the authentication type.
        
        Returns:
            Authentication type string or None
        """
        return self.auth_type


def create_auth_from_config(auth_config: Dict[str, str]) -> Optional[AuthHandler]:
    """
    Create AuthHandler from configuration dictionary.
    
    Args:
        auth_config: Authentication configuration
            Example: {"type": "bearer", "token_env": "API_TOKEN"}
            Example: {"type": "api_key", "key_env": "API_KEY", "header_name": "X-API-Key"}
    
    Returns:
        Configured AuthHandler or None
    """
    if not auth_config:
        return None
    
    auth_handler = AuthHandler()
    auth_type = auth_config.get("type", "").lower()
    
    try:
        if auth_type == "bearer":
            token = auth_config.get("token")
            token_env = auth_config.get("token_env")
            auth_handler.set_bearer_token(token=token, token_env=token_env)
        
        elif auth_type == "api_key":
            api_key = auth_config.get("api_key")
            key_env = auth_config.get("key_env")
            header_name = auth_config.get("header_name", "X-API-Key")
            auth_handler.set_api_key(api_key=api_key, key_env=key_env, header_name=header_name)
        
        elif auth_type == "basic":
            username = auth_config.get("username", "")
            password = auth_config.get("password", "")
            auth_handler.set_basic_auth(username, password)
        
        else:
            return None
        
        return auth_handler
    
    except ValueError as e:
        print(f"Auth configuration error: {e}")
        return None
