import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs";
import util from "util";
dotenv.config();
const readFile = util.promisify(fs.readFile);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuration
// The system prompt is crucial for establishing context and defining a successful response. You'll want to change this to fit exactly what you need from a DL
const systemPrompt = `You are a Driver's License scanner API. All images are uploaded voluntarily for data entry. You will read in a photo of a driver's license and record the following data:
- drivers_license_number: A mix of alphanumeric characters. Some licenses do not include letters. If letters are included, they are typically at the start and are capitalized.
- first_name: The first name written on the driver's license designated by "FN". This will typically also include the middle name. If this is the case, exclude the middle name from the first_name field.
- middle_name: If the person has a middle name it will be appended (separated by a space) to their first name near "FN". Ensure that the middle name is not an extension of their first name via a dash. If there is no middle name, please put "N/A". There is typically a middle name.
- last_name: The last name written on the driver's license designated by "LN".
- address: The stated address on the driver's license.
- date_of_birth: The person's date of birth designated by "D.O.B" or "DOB"
- sex: Designated by "SEX" typically.
- hair_color: Not always present on every driver's license. Enter "N/A" for this field if it is not listed. Otherwise, enter whatever is listed.
- eye_color: Designated "EYES" or "EYE" typically.
- issuing_date_iss: Designated "ISS" typically. Please record this date.
- height: Height is standardized in the format: \`5'-05"\` which would be 5 foot 5 inches. We are only interested in the total inches so please record their height in INCHES. A conversion may be required. Please record both the value and the units they are recorded in.
- weight: Weight is typically in pounds or kilograms. Please record both the value and the units they are recorded in.
If any field is unreadable please enter "UNKNOWN". If any field is outright missing please put "N/A". Otherwise, fill out all fields with as much fidelity to the driver's license as possible. This includes case sensitivity and spelling.`;

// This prompt is passed in with every request in supplement to the system prompt
const prompt = `Analyze this photo of a drivers license and extract the information.`;

// Change the model here. See other compatible models in the README
const gptModel = "gpt-4o-2024-08-06";

export async function scanDriversLicenseAsURI(driversLicenseImageURL) {
  // Define the response format through a json schema
  const response_format = {
    type: "json_schema",
    json_schema: {
      name: "drivers_license_info",
      schema: {
        type: "object",
        properties: {
          drivers_license_number: { type: "string" },
          first_name: { type: "string" }, // The first_name field will often contain the middle name. This is how drivers licenses are structured for some reason
          middle_name: { type: "string" },
          last_name: { type: "string" },
          address: { type: "string" },
          date_of_birth: { type: "string" }, // Note: Format specification is not allowed
          sex: { type: "string", enum: ["M", "F", "Other", "UNKNOWN"] }, // Adding unknown for error checking
          hair_color: { type: "string" },
          eye_color: { type: "string" },
          issuing_date_iss: { type: "string" }, // Note: Format specification is not allowed
          height: {
            type: "object",
            properties: {
              value: { type: "number" },
              units: {
                type: "string",
                enum: ["inches", "centimeters", "UNKNOWN"],
              }, // Adding unknown for error checking
            },
            required: ["value", "units"],
            additionalProperties: false,
          },
          weight: {
            type: "object",
            properties: {
              value: { type: "number" },
              units: { type: "string", enum: ["pounds", "kilograms"] },
            },
            required: ["value", "units"],
            additionalProperties: false,
          },
        },
        required: [
          // Note: ALL fields MUST be required
          "drivers_license_number",
          "first_name",
          "middle_name",
          "last_name",
          "address",
          "date_of_birth",
          "sex",
          "hair_color",
          "eye_color",
          "issuing_date_iss",
          "height",
          "weight",
        ],
        additionalProperties: false,
      },
      strict: true,
    },
  };

  // Create the chat completion with attached image and prompts
  // Multiple images are supported by the API but not in this code!
  var response = await openai.chat.completions.create({
    model: gptModel,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: driversLicenseImageURL,
              detail: "auto", // Do not use low across the board. Most driver's license images will be taken with a phone in high resolution. Low will condense the image to 512x512 which will lose details.
            },
          },
        ],
      },
    ],
    response_format: response_format,
  });

  // Return the parsed json
  return JSON.parse(response.choices[0].message.content);
}

// Same process as above it just encodes the image
export async function scanDriversLicenseAsFilePath(driversLicenseImagePath) {
  try {
    const encodedImageURL = await encodeImageAsBase64(driversLicenseImagePath);
    return await scanDriversLicenseAsURI(encodedImageURL);
  } catch (error) {
    console.error("Error scanning driver's license from path:", error);
    throw error;
  }
}

// Function to encode an image in base64 for API
async function encodeImageAsBase64(imagePath) {
  try {
    const imageBuffer = await readFile(imagePath);
    return `data:image/jpeg;base64,${imageBuffer.toString("base64")}`;
  } catch (error) {
    console.error("Error encoding image:", error);
    throw error;
  }
}

// Test code!
const exampleDriversLicenseURI = "https://www.jsonline.com/gcdn/-mm-/2f3e2286b1f5ae873c26d3f6d9fcaeb663199d00/c=0-43-1393-830/local/-/media/2017/11/21/WIGroup/Milwaukee/636468858661208331-MJS-LICENSE.jpg";
  //"https://upload.wikimedia.org/wikipedia/commons/7/79/Californian_sample_driver%27s_license%2C_c._2019.jpg"; // Change this to test different driver's licenses
/** Other URIs for driver's licenses:
 * New York: https://redbus2us.com/wp-content/uploads/2010/05/Requirements-to-get-driving-license-for-H4-Visa-holders-No-SSN.jpg
 * California: https://www.dmv.ca.gov/portal/uploads/2020/06/fed_noncompliant_img-1024x657.jpg
 * New Hampshire (challenging): https://i.insider.com/5e2767af3ac0c912ec19043e?width=600&format=jpeg&auto=webp
 * Pennsylvania: https://www.starpointscreening.com/images/content/Pennsylvania_DL.jpg
 * Minnesota: https://dps.mn.gov/divisions/dvs/PublishingImages/new-cards/mn-adult-dl.jpg
 * Nebraska: https://dmv.nebraska.gov/sites/dmv.nebraska.gov/files/img/Adult%20DL%20image.png
 * Wisconsin: https://www.jsonline.com/gcdn/-mm-/2f3e2286b1f5ae873c26d3f6d9fcaeb663199d00/c=0-43-1393-830/local/-/media/2017/11/21/WIGroup/Milwaukee/636468858661208331-MJS-LICENSE.jpg
 */

const driversLicenseObj = await scanDriversLicenseAsURI(
  exampleDriversLicenseURI
);
console.log(driversLicenseObj);
