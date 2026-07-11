# Contributing to Android APK Builder

Thank you for your interest in contributing to this project! This guide will help you get started.

## 🎯 How to Contribute

### Types of Contributions
- 🐛 **Bug Reports** - Help us identify and fix issues
- 💡 **Feature Requests** - Suggest new features or improvements
- 📝 **Documentation** - Improve guides, tutorials, and examples
- 🔧 **Code Contributions** - Fix bugs or implement new features
- 🎨 **Design** - UI/UX improvements and templates
- 🧪 **Testing** - Add tests or improve test coverage

## 🚀 Getting Started

### 1. Fork and Clone
```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/android-apk-builder.git
cd android-apk-builder

# Add the original repository as upstream
git remote add upstream https://github.com/ORIGINAL_OWNER/android-apk-builder.git
```

### 2. Create a Branch
```bash
# Create a new branch for your feature
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b bugfix/issue-description
```

### 3. Make Your Changes
- Follow the coding standards below
- Test your changes thoroughly
- Update documentation if needed
- Add tests for new features

### 4. Commit Your Changes
```bash
# Stage your changes
git add .

# Commit with a descriptive message
git commit -m "Add feature: description of what you added"
```

### 5. Push and Create PR
```bash
# Push to your fork
git push origin feature/your-feature-name

# Then create a Pull Request on GitHub
```

## 📋 Coding Standards

### Kotlin Code Style
- Follow [Android Kotlin Style Guide](https://developer.android.com/kotlin/style-guide)
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

### XML Layout Guidelines
- Use descriptive `android:id` attributes
- Follow proper indentation (4 spaces)
- Use `dp` for dimensions, `sp` for text sizes
- Add `android:contentDescription` for accessibility

### GitHub Actions
- Keep workflows efficient and fast
- Use proper caching strategies
- Add comments explaining complex steps
- Test workflows thoroughly

## 🧪 Testing

### Before Submitting
1. **Build Test**: Ensure the project builds successfully
2. **APK Test**: Verify the generated APK works correctly
3. **Workflow Test**: Check that GitHub Actions complete successfully
4. **Documentation Test**: Verify all links and code examples work

### Testing Locally
```bash
# Check if the project builds (requires Android SDK)
./gradlew build

# Or just verify file structure
find . -name "*.gradle" -o -name "*.kt" -o -name "*.xml" | head -10
```

## 📝 Documentation Guidelines

### Writing Style
- Use clear, concise language
- Include code examples where helpful
- Add screenshots for UI changes
- Keep sections well-organized with headers

### Markdown Standards
- Use proper heading hierarchy (H1, H2, H3...)
- Include table of contents for long documents
- Use code blocks with language specification
- Add emoji sparingly for visual appeal

## 🐛 Bug Reports

### When Reporting Bugs
Include the following information:
- **Description**: Clear description of the issue
- **Steps to Reproduce**: Exact steps to trigger the bug
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Environment**: OS, browser, device info
- **Logs**: Any error messages or build logs

### Bug Report Template
```markdown
## Bug Description
Brief description of the issue

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: [Windows/Mac/Linux]
- Browser: [Chrome/Firefox/Safari]
- Repository: [Link to your repository]

## Additional Context
Any other relevant information
```

## 💡 Feature Requests

### Before Requesting
- Check if the feature already exists
- Search existing issues and discussions
- Consider if it fits the project scope
- Think about implementation complexity

### Feature Request Template
```markdown
## Feature Description
Clear description of the proposed feature

## Use Case
Why is this feature needed? What problem does it solve?

## Proposed Solution
How should this feature work?

## Alternatives Considered
Any alternative solutions you've considered

## Additional Context
Screenshots, mockups, or other relevant information
```

## 🎨 Design Contributions

### UI/UX Improvements
- Follow Material Design guidelines
- Ensure accessibility compliance
- Test on different screen sizes
- Consider dark mode compatibility

### App Templates
- Create complete, functional examples
- Include proper documentation
- Test thoroughly on real devices
- Follow Android best practices

## 🔧 Code Review Process

### What We Look For
- **Functionality**: Does the code work as intended?
- **Quality**: Is the code clean and well-structured?
- **Performance**: Are there any performance issues?
- **Security**: Are there any security concerns?
- **Documentation**: Is the code properly documented?

### Response Time
- We aim to respond to PRs within 3-5 business days
- Simple fixes may be merged faster
- Complex changes may require more discussion

## 📞 Getting Help

### Where to Ask Questions
- **GitHub Discussions**: For general questions and ideas
- **GitHub Issues**: For bug reports and feature requests
- **Email**: For private or sensitive matters

### Community Guidelines
- Be respectful and constructive
- Help others when you can
- Follow the code of conduct
- Share knowledge and learn together

## 🏆 Recognition

### Contributors
All contributors will be:
- Listed in the project README
- Credited in release notes
- Given appropriate GitHub repository permissions

### Significant Contributions
Major contributions may result in:
- Co-maintainer status
- Special recognition in documentation
- Input on project direction

## 📋 Checklist for Contributors

Before submitting your contribution:

- [ ] I have read and understood this contributing guide
- [ ] My code follows the project's coding standards
- [ ] I have tested my changes thoroughly
- [ ] I have updated documentation if necessary
- [ ] My commit messages are clear and descriptive
- [ ] I have checked for any breaking changes
- [ ] I have added tests for new functionality (if applicable)
- [ ] My changes don't introduce security vulnerabilities

## 🔄 Maintenance

### Keeping Your Fork Updated
```bash
# Fetch upstream changes
git fetch upstream

# Merge changes into your main branch
git checkout main
git merge upstream/main

# Push updates to your fork
git push origin main
```

### Rebasing Your Branch
```bash
# Rebase your feature branch on latest main
git checkout feature/your-feature-name
git rebase main

# Force push if necessary (be careful!)
git push --force-with-lease origin feature/your-feature-name
```

---

Thank you for contributing to Android APK Builder! Your efforts help make Android development more accessible to everyone. 🚀