/**
 * OCR Service - Extract data from identity documents using AI Vision
 * Uses Gemini Vision API for accurate text extraction and data parsing
 */

import { invokeLLM } from "./llm";
import { TRPCError } from "@trpc/server";

export interface ExtractedIdData {
  fullName: string;
  nationalIdNumber: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  expiryDate?: string;
  confidence: number; // 0-100
  rawText: string;
}

/**
 * Extract identity information from an ID card image using AI Vision
 * @param imageUrl - URL of the ID card image
 * @returns Extracted identity data with confidence score
 */
export async function extractIdDataFromImage(imageUrl: string): Promise<ExtractedIdData> {
  try {
    // Validate image URL
    if (!imageUrl || !imageUrl.startsWith("http")) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid image URL provided",
      });
    }

    // Call Gemini Vision API through LLM
    const response = await invokeLLM({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high",
              },
            },
            {
              type: "text",
              text: `أنت متخصص في استخراج البيانات من بطاقات الهوية الوطنية. 
              
يرجى تحليل صورة بطاقة الهوية هذه واستخراج المعلومات التالية بدقة:
1. الاسم الكامل (Full Name)
2. رقم الهوية الوطنية (National ID Number)
3. تاريخ الميلاد (Date of Birth)
4. الجنس (Gender)
5. الجنسية (Nationality)
6. تاريخ انتهاء الصلاحية (Expiry Date)

يجب أن تكون النتيجة بصيغة JSON مع تقدير درجة الثقة (0-100) لكل حقل.
إذا لم تتمكن من قراءة أي حقل، ضع قيمة null له.

الرد يجب أن يكون بصيغة JSON فقط بدون أي نصوص إضافية.`,
            },
          ],
        },
      ],
      outputSchema: {
        name: "id_extraction",
        schema: {
          type: "object",
          properties: {
            fullName: {
              type: "string",
              description: "الاسم الكامل للشخص",
            },
            nationalIdNumber: {
              type: "string",
              description: "رقم الهوية الوطنية",
            },
            dateOfBirth: {
              type: ["string", "null"],
              description: "تاريخ الميلاد بصيغة YYYY-MM-DD",
            },
            gender: {
              type: ["string", "null"],
              description: "الجنس (Male/Female)",
            },
            nationality: {
              type: ["string", "null"],
              description: "الجنسية",
            },
            expiryDate: {
              type: ["string", "null"],
              description: "تاريخ انتهاء الصلاحية بصيغة YYYY-MM-DD",
            },
            confidence: {
              type: "number",
              description: "درجة الثقة من 0 إلى 100",
            },
          },
          required: ["fullName", "nationalIdNumber", "confidence"],
        },
      },
    });

    // Parse the response
    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to parse OCR response",
      });
    }

    // Parse JSON from response
    let extractedData;
    try {
      extractedData = JSON.parse(content);
    } catch (e) {
      // Try to extract JSON from the response if it contains additional text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Invalid OCR response format",
        });
      }
      extractedData = JSON.parse(jsonMatch[0]);
    }

    // Validate required fields
    if (!extractedData.fullName || !extractedData.nationalIdNumber) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Could not extract required information from the ID card. Please ensure the image is clear and readable.",
      });
    }

    // Validate confidence score
    const confidence = Math.min(100, Math.max(0, extractedData.confidence || 0));
    if (confidence < 70) {
      console.warn(`[OCR] Low confidence score (${confidence}%) for ID extraction`);
    }

    return {
      fullName: extractedData.fullName.trim(),
      nationalIdNumber: extractedData.nationalIdNumber.trim(),
      dateOfBirth: extractedData.dateOfBirth || undefined,
      gender: extractedData.gender || undefined,
      nationality: extractedData.nationality || undefined,
      expiryDate: extractedData.expiryDate || undefined,
      confidence,
      rawText: content,
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    console.error("[OCR] Error extracting ID data:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to process identity document. Please try again.",
    });
  }
}

/**
 * Validate extracted ID data
 * @param data - Extracted identity data
 * @returns True if data is valid
 */
export function validateExtractedData(data: ExtractedIdData): boolean {
  // Check if confidence is acceptable
  if (data.confidence < 70) {
    return false;
  }

  // Validate national ID number format (basic validation)
  if (!data.nationalIdNumber || data.nationalIdNumber.length < 8) {
    return false;
  }

  // Validate full name
  if (!data.fullName || data.fullName.length < 3) {
    return false;
  }

  return true;
}

/**
 * Sanitize extracted data to remove sensitive information for logging
 * @param data - Extracted identity data
 * @returns Sanitized data
 */
export function sanitizeExtractedData(data: ExtractedIdData): Partial<ExtractedIdData> {
  return {
    fullName: data.fullName,
    nationalIdNumber: `${data.nationalIdNumber.substring(0, 3)}${"*".repeat(data.nationalIdNumber.length - 6)}${data.nationalIdNumber.substring(data.nationalIdNumber.length - 3)}`,
    confidence: data.confidence,
  };
}
