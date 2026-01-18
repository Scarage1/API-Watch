"""
Installation test script.
Verifies that all dependencies are installed correctly.
"""
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

def test_imports():
    """Test if all required modules can be imported."""
    print("🔍 Testing imports...")
    
    tests = [
        ("requests", "HTTP client library"),
        ("yaml", "YAML parser"),
        ("jinja2", "Template engine"),
        ("rich", "Terminal UI"),
        ("fastapi", "Web framework"),
        ("uvicorn", "ASGI server"),
        ("dotenv", "Environment variables"),
    ]
    
    failed = []
    
    for module_name, description in tests:
        try:
            __import__(module_name)
            print(f"  ✓ {module_name:15} - {description}")
        except ImportError as e:
            print(f"  ✗ {module_name:15} - MISSING")
            failed.append(module_name)
    
    return failed


def test_project_modules():
    """Test if project modules can be imported."""
    print("\n🔍 Testing project modules...")
    
    modules = [
        "utils",
        "auth",
        "retry",
        "runner",
        "diagnose",
        "report",
    ]
    
    failed = []
    
    for module_name in modules:
        try:
            __import__(module_name)
            print(f"  ✓ {module_name}.py")
        except Exception as e:
            print(f"  ✗ {module_name}.py - Error: {e}")
            failed.append(module_name)
    
    return failed


def test_directories():
    """Test if required directories exist."""
    print("\n🔍 Testing directory structure...")
    
    dirs = [
        "src",
        "examples",
        "logs",
        "reports",
        "tests",
    ]
    
    failed = []
    
    for dir_name in dirs:
        dir_path = Path(__file__).parent / dir_name
        if dir_path.exists():
            print(f"  ✓ {dir_name}/")
        else:
            print(f"  ✗ {dir_name}/ - MISSING")
            failed.append(dir_name)
    
    return failed


def test_example_files():
    """Test if example files exist."""
    print("\n🔍 Testing example files...")
    
    files = [
        "examples/test_suite.yaml",
        "examples/env.sample",
        "examples/sample_payload.json",
        "examples/QUICKSTART.md",
    ]
    
    failed = []
    
    for file_path in files:
        full_path = Path(__file__).parent / file_path
        if full_path.exists():
            print(f"  ✓ {file_path}")
        else:
            print(f"  ✗ {file_path} - MISSING")
            failed.append(file_path)
    
    return failed


def main():
    """Run all tests."""
    print("=" * 60)
    print("API Debugging Toolkit - Installation Test")
    print("=" * 60)
    print()
    
    # Run tests
    failed_imports = test_imports()
    failed_modules = test_project_modules()
    failed_dirs = test_directories()
    failed_files = test_example_files()
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    all_failed = failed_imports + failed_modules + failed_dirs + failed_files
    
    if not all_failed:
        print("\n✅ All tests passed! Installation is complete.")
        print("\n🚀 Next steps:")
        print("  1. Copy examples/env.sample to .env")
        print("  2. Edit .env with your API credentials")
        print("  3. Run: python src/main.py request --method GET --url https://jsonplaceholder.typicode.com/posts/1")
        print("  4. Check out EXAMPLES.md for more usage examples")
        return 0
    else:
        print("\n❌ Some tests failed:")
        
        if failed_imports:
            print(f"\n  Missing dependencies: {', '.join(failed_imports)}")
            print("  Fix: pip install -r requirements.txt")
        
        if failed_modules:
            print(f"\n  Module errors: {', '.join(failed_modules)}")
            print("  Check if all source files are present in src/")
        
        if failed_dirs:
            print(f"\n  Missing directories: {', '.join(failed_dirs)}")
            print("  These will be created automatically on first run")
        
        if failed_files:
            print(f"\n  Missing files: {', '.join(failed_files)}")
        
        return 1


if __name__ == "__main__":
    sys.exit(main())
