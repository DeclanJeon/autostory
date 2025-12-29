# Multimodal Feature Verification Plan

This workflow will help you verify the newly implemented Multimodal Upload features, including PDF image extraction, AI analysis, and Tistory/Naver integration.

## 1. Prerequisites

- Ensure dependencies are installed: `pnpm install`
- Ensure you have a valid PDF file with images for testing (e.g., `test_doc.pdf`).
- Ensure `AI API Key` (Google Gemini) is set in Settings.

## 2. Server Start

// turbo
pnpm dev

## 3. Test Cases

### Case A: Image Extraction (Original Mode)

1. Open the "Writer" tab.
2. Click "Upload File".
3. Select a PDF file containing images.
4. In the modal, select **"Original Capture Mode"**.
5. Click "Generate Series".
6. **Verify:**
   - The file process log shows "Extracting images from PDF".
   - The generated content contains images from the PDF.
   - Images are embedded as Base64 (check HTML source or visual inspection).

### Case B: AI Image Generation (AI Mode)

1. Open the "Writer" tab.
2. Click "Upload File".
3. Select a PDF file.
4. In the modal, select **"AI Generation Mode"**.
5. Click "Generate Series".
6. **Verify:**
   - The log shows "Analyzing image for prompt...".
   - The log shows "Generating image for prompt...".
   - The generated content contains new images (currently placeholders from `placehold.co`).

### Case C: Tistory Upload Verification

1. Enable "Auto Publish" in the Upload Modal.
2. Run the process (Original or AI Mode).
3. **Verify:**
   - The browser opens and navigates to Tistory editor.
   - The content is pasted correctly.
   - Images are visible in the editor (not broken icons).
   - "Image converted to Base64" log appears in the terminal.

## 4. Troubleshooting

- If images are missing: Check `logs/app.log` for "Failed to extract image" or "Failed to convert image".
- If AI generation fails: Check API Key settings and "Image Analysis Failed" logs.
