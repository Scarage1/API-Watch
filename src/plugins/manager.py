"""
API-Watch Plugin System.

Provides a hook-based extension mechanism for:
  - Pre-request processing (modify request before execution)
  - Post-response processing (analyze/transform responses)
  - Custom assertions (extend the test runner)
  - Event listeners (react to app lifecycle events)

Plugins are loaded from:
  1. Built-in plugins in `src/plugins/builtin/`
  2. User plugins from `~/.apiwatch/plugins/` or `$APIWATCH_PLUGIN_DIR`
  3. Project plugins from `.apiwatch/plugins/` in the working directory

Design:
  - Plugins are Python modules with a `register(manager)` function
  - The PluginManager dispatches events to all registered hooks
  - Hooks are async-first but support sync functions via auto-wrapping
"""
from __future__ import annotations

import asyncio
import importlib
import importlib.util
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Union

logger = logging.getLogger(__name__)


# ── Hook Types ────────────────────────────────────────────────
class HookType(str, Enum):
    PRE_REQUEST = "pre_request"
    POST_RESPONSE = "post_response"
    ON_ERROR = "on_error"
    ON_STARTUP = "on_startup"
    ON_SHUTDOWN = "on_shutdown"
    CUSTOM_ASSERTION = "custom_assertion"


# ── Plugin Metadata ──────────────────────────────────────────
@dataclass
class PluginInfo:
    """Metadata about a registered plugin."""
    name: str
    version: str = "1.0.0"
    description: str = ""
    author: str = ""
    hooks: List[HookType] = field(default_factory=list)
    enabled: bool = True


# ── Hook Signatures ──────────────────────────────────────────
HookFn = Callable[..., Union[Any, Awaitable[Any]]]


@dataclass
class RegisteredHook:
    """A hook function registered by a plugin."""
    hook_type: HookType
    plugin_name: str
    fn: HookFn
    priority: int = 0  # Lower = runs first


# ── Plugin Interface ─────────────────────────────────────────
class Plugin(ABC):
    """
    Base class for API-Watch plugins.

    Subclass this and implement the hooks you need:

        class MyPlugin(Plugin):
            info = PluginInfo(name="my-plugin", version="1.0.0")

            async def pre_request(self, config):
                config['headers']['X-Custom'] = 'value'
                return config

            async def post_response(self, result):
                print(f"Got {result.status_code}")
                return result
    """

    info: PluginInfo

    async def pre_request(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Called before each request. Return modified config."""
        return config

    async def post_response(self, result: Any) -> Any:
        """Called after each response. Return modified result."""
        return result

    async def on_error(self, error: Exception, context: Dict[str, Any]) -> None:
        """Called when a request fails."""
        pass

    async def on_startup(self) -> None:
        """Called when the app starts."""
        pass

    async def on_shutdown(self) -> None:
        """Called when the app stops."""
        pass


# ── Plugin Manager ───────────────────────────────────────────
class PluginManager:
    """
    Central plugin manager. Registers, loads, and dispatches hooks.

    Usage:
        manager = PluginManager()
        manager.register(MyPlugin())
        modified_config = await manager.dispatch_pre_request(config)
    """

    def __init__(self):
        self._plugins: Dict[str, Plugin] = {}
        self._hooks: Dict[HookType, List[RegisteredHook]] = {h: [] for h in HookType}

    @property
    def plugins(self) -> Dict[str, PluginInfo]:
        """Return info about all registered plugins."""
        return {name: p.info for name, p in self._plugins.items()}

    def register(self, plugin: Plugin) -> None:
        """Register a plugin instance."""
        name = plugin.info.name
        if name in self._plugins:
            logger.warning("Plugin '%s' already registered — skipping", name)
            return

        self._plugins[name] = plugin

        # Auto-detect hooks from implemented methods
        hook_map = {
            HookType.PRE_REQUEST: "pre_request",
            HookType.POST_RESPONSE: "post_response",
            HookType.ON_ERROR: "on_error",
            HookType.ON_STARTUP: "on_startup",
            HookType.ON_SHUTDOWN: "on_shutdown",
        }

        for hook_type, method_name in hook_map.items():
            method = getattr(plugin, method_name, None)
            if method and method is not getattr(Plugin, method_name):
                self._hooks[hook_type].append(
                    RegisteredHook(
                        hook_type=hook_type,
                        plugin_name=name,
                        fn=method,
                    )
                )
                plugin.info.hooks.append(hook_type)

        logger.info("Plugin registered: %s v%s (%d hooks)", name, plugin.info.version, len(plugin.info.hooks))

    def unregister(self, name: str) -> bool:
        """Unregister a plugin by name."""
        if name not in self._plugins:
            return False

        # Remove all hooks for this plugin
        for hook_type in HookType:
            self._hooks[hook_type] = [
                h for h in self._hooks[hook_type] if h.plugin_name != name
            ]

        del self._plugins[name]
        logger.info("Plugin unregistered: %s", name)
        return True

    # ── Hook Dispatchers ──────────────────────────────────────

    async def dispatch_pre_request(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Run all pre_request hooks in order. Returns modified config."""
        for hook in sorted(self._hooks[HookType.PRE_REQUEST], key=lambda h: h.priority):
            try:
                result = hook.fn(config)
                if asyncio.iscoroutine(result):
                    config = await result
                else:
                    config = result
            except Exception as e:
                logger.error("Plugin '%s' pre_request hook failed: %s", hook.plugin_name, e)
        return config

    async def dispatch_post_response(self, result: Any) -> Any:
        """Run all post_response hooks in order. Returns modified result."""
        for hook in sorted(self._hooks[HookType.POST_RESPONSE], key=lambda h: h.priority):
            try:
                ret = hook.fn(result)
                if asyncio.iscoroutine(ret):
                    result = await ret
                else:
                    result = ret
            except Exception as e:
                logger.error("Plugin '%s' post_response hook failed: %s", hook.plugin_name, e)
        return result

    async def dispatch_on_error(self, error: Exception, context: Dict[str, Any]) -> None:
        """Notify all on_error hooks."""
        for hook in self._hooks[HookType.ON_ERROR]:
            try:
                ret = hook.fn(error, context)
                if asyncio.iscoroutine(ret):
                    await ret
            except Exception as e:
                logger.error("Plugin '%s' on_error hook failed: %s", hook.plugin_name, e)

    async def dispatch_on_startup(self) -> None:
        """Notify all on_startup hooks."""
        for hook in self._hooks[HookType.ON_STARTUP]:
            try:
                ret = hook.fn()
                if asyncio.iscoroutine(ret):
                    await ret
            except Exception as e:
                logger.error("Plugin '%s' on_startup hook failed: %s", hook.plugin_name, e)

    async def dispatch_on_shutdown(self) -> None:
        """Notify all on_shutdown hooks."""
        for hook in self._hooks[HookType.ON_SHUTDOWN]:
            try:
                ret = hook.fn()
                if asyncio.iscoroutine(ret):
                    await ret
            except Exception as e:
                logger.error("Plugin '%s' on_shutdown hook failed: %s", hook.plugin_name, e)

    # ── Plugin Loading ────────────────────────────────────────

    def load_from_directory(self, directory: Union[str, Path]) -> int:
        """
        Load all plugins from a directory.
        Each .py file should have a `register(manager)` function.
        Returns the number of plugins loaded.
        """
        path = Path(directory)
        if not path.is_dir():
            return 0

        loaded = 0
        for plugin_file in sorted(path.glob("*.py")):
            if plugin_file.name.startswith("_"):
                continue
            try:
                spec = importlib.util.spec_from_file_location(
                    f"apiwatch_plugin_{plugin_file.stem}", plugin_file
                )
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)

                    register_fn = getattr(module, "register", None)
                    if register_fn:
                        register_fn(self)
                        loaded += 1
                    else:
                        logger.warning("Plugin %s has no register() function", plugin_file.name)
            except Exception as e:
                logger.error("Failed to load plugin %s: %s", plugin_file.name, e)

        return loaded

    def load_default_plugins(self) -> int:
        """Load plugins from all default locations."""
        loaded = 0

        # 1. Built-in plugins
        builtin_dir = Path(__file__).parent / "builtin"
        loaded += self.load_from_directory(builtin_dir)

        # 2. User plugins
        user_dir = Path(os.getenv("APIWATCH_PLUGIN_DIR", Path.home() / ".apiwatch" / "plugins"))
        loaded += self.load_from_directory(user_dir)

        # 3. Project plugins
        project_dir = Path.cwd() / ".apiwatch" / "plugins"
        loaded += self.load_from_directory(project_dir)

        if loaded:
            logger.info("Loaded %d plugin(s)", loaded)
        return loaded


# ── Global singleton ──────────────────────────────────────────
import os

_manager: Optional[PluginManager] = None


def get_plugin_manager() -> PluginManager:
    """Get or create the global plugin manager singleton."""
    global _manager
    if _manager is None:
        _manager = PluginManager()
    return _manager
