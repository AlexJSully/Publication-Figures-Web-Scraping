import axios from "axios";
import fs from "fs";
import path from "path";
import { fetchArticleDetails } from "./fetchArticleDetails";
import { parseFigures } from "./parseFigures";

jest.mock("axios");
jest.mock("./parseFigures");

describe("fetchArticleDetails", () => {
	const throttle = jest.fn((fn) => fn());
	const pmids = ["PMC123456", "PMC654321"];
	const species = "Homo sapiens";
	const cachedIDsFilePath = path.resolve(__dirname, "../output/cache/id.json");

	beforeEach(() => {
		jest.clearAllMocks();
		const dir = path.dirname(cachedIDsFilePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		if (fs.existsSync(cachedIDsFilePath)) {
			fs.unlinkSync(cachedIDsFilePath);
		}
		// Ensure the cached ID file is empty
		fs.writeFileSync(cachedIDsFilePath, JSON.stringify([]));
	});

	afterEach(() => {
		// Delete the output directory
		const dir = path.dirname(cachedIDsFilePath);
		if (fs.existsSync(dir)) {
			fs.rmdirSync(dir, { recursive: true });
		}
	});

	it("should fetch article details in batches and call parseFigures", async () => {
		const mockResponse = { data: "<xml>mock data</xml>" };
		(axios.get as jest.Mock).mockResolvedValue(mockResponse);

		await fetchArticleDetails(throttle, pmids, species);

		expect(axios.get).toHaveBeenCalledTimes(1);
		expect(axios.get).toHaveBeenCalledWith(
			"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=PMC123456,PMC654321&retmode=xml",
		);
		expect(parseFigures).toHaveBeenCalledWith(throttle, mockResponse.data, species);
	});

	it("should handle errors gracefully", async () => {
		const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		(axios.get as jest.Mock).mockRejectedValue(new Error("Network error"));

		await fetchArticleDetails(throttle, pmids, species);

		expect(axios.get).toHaveBeenCalledTimes(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith("Error fetching article details:", expect.any(Error));

		consoleErrorSpy.mockRestore();
	});

	it("should cache fetched IDs and skip already cached IDs", async () => {
		const mockResponse = { data: "<xml>mock data</xml>" };
		(axios.get as jest.Mock).mockResolvedValue(mockResponse);

		// Initial fetch to cache the IDs
		await fetchArticleDetails(throttle, pmids, species);

		expect(fs.existsSync(cachedIDsFilePath)).toBe(true);
		const cachedIDs = JSON.parse(fs.readFileSync(cachedIDsFilePath, "utf-8"));
		expect(cachedIDs).toEqual(pmids);

		// Fetch again with the same IDs, should skip fetching
		await fetchArticleDetails(throttle, pmids, species);

		expect(axios.get).toHaveBeenCalledTimes(1); // Should not call axios.get again
	});

	it("should handle empty PMID array gracefully", async () => {
		const emptyPmids: string[] = [];
		const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});

		await fetchArticleDetails(throttle, emptyPmids, species);

		expect(axios.get).not.toHaveBeenCalled();
		expect(consoleLogSpy).toHaveBeenCalledWith("No PMC IDs provided for Homo sapiens.");

		consoleLogSpy.mockRestore();
	});
});
