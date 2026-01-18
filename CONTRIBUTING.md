# Contributing to APIWatch

Thank you for your interest in contributing to APIWatch! 🎉

## How to Contribute

### Reporting Bugs 🐛

Found a bug? Please open an issue with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, Python version)

### Suggesting Features 💡

Have an idea? Open an issue with:
- Feature description
- Use case / problem it solves
- Proposed implementation (optional)

### Submitting Code 🔧

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
   - Follow existing code style
   - Add tests if applicable
   - Update documentation

4. **Commit with clear messages**
   ```bash
   git commit -m "feat: add OAuth2 authentication support"
   ```

5. **Push and create a Pull Request**
   ```bash
   git push origin feature/amazing-feature
   ```

## Code Style

- Use type hints
- Follow PEP 8
- Add docstrings to functions
- Keep functions focused and modular

## Testing

Before submitting:
```bash
# Test installation
python test_installation.py

# Test basic functionality
python src/main.py request --method GET --url https://jsonplaceholder.typicode.com/posts/1
```

## Questions?

Open an issue for discussion!

---

**Thanks for making APIWatch better!** 🚀
