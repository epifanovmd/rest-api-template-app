import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid } from "../../test/helpers";
import { LinkPreviewService } from "./link-preview.service";

describe("LinkPreviewService", () => {
  let service: LinkPreviewService;
  let repo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    repo = createMockRepository();

    (repo as any).findByUrl = sinon.stub().resolves(null);

    service = new LinkPreviewService(repo as any);
  });

  afterEach(() => sandbox.restore());

  describe("extractUrls", () => {
    it("should extract URLs from text", () => {
      const text = "Check out https://example.com and http://test.org/page";

      const urls = service.extractUrls(text);

      expect(urls).to.have.length(2);
      expect(urls).to.include("https://example.com");
      expect(urls).to.include("http://test.org/page");
    });

    it("should return empty array when no URLs found", () => {
      const text = "No links here, just plain text";

      const urls = service.extractUrls(text);

      expect(urls).to.be.an("array").that.is.empty;
    });

    it("should deduplicate URLs", () => {
      const text = "Visit https://example.com and again https://example.com";

      const urls = service.extractUrls(text);

      expect(urls).to.have.length(1);
      expect(urls[0]).to.equal("https://example.com");
    });
  });

  describe("fetchPreview", () => {
    it("should return cached preview when fresh", async () => {
      const cached = {
        url: "https://example.com",
        title: "Example",
        description: "An example site",
        imageUrl: "https://example.com/image.png",
        siteName: "Example",
        fetchedAt: new Date(), // fresh cache
      };

      (repo as any).findByUrl.resolves(cached);

      const result = await service.fetchPreview("https://example.com");

      expect(result).to.not.be.null;
      expect(result!.url).to.equal("https://example.com");
      expect(result!.title).to.equal("Example");
      expect(result!.description).to.equal("An example site");
      expect(result!.imageUrl).to.equal("https://example.com/image.png");
      expect(result!.siteName).to.equal("Example");
    });

    it("should refetch when cache is stale", async () => {
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const cached = {
        url: "https://example.com",
        title: "Old Title",
        description: "Old",
        imageUrl: null,
        siteName: null,
        fetchedAt: staleDate,
      };

      (repo as any).findByUrl.resolves(cached);

      // Stub the private _httpGet method by stubbing the prototype
      const httpGetStub = sandbox.stub(
        LinkPreviewService.prototype as any,
        "_httpGet",
      );

      httpGetStub.resolves(
        "<html><head><title>New Title</title><meta property=\"og:description\" content=\"New desc\"></head><body></body></html>",
      );

      repo.save.resolves(cached);

      const result = await service.fetchPreview("https://example.com");

      expect(result).to.not.be.null;
      expect(result!.title).to.equal("New Title");
      expect(repo.save.calledOnce).to.be.true;
    });

    it("should return null when HTTP fetch fails", async () => {
      (repo as any).findByUrl.resolves(null);

      const httpGetStub = sandbox.stub(
        LinkPreviewService.prototype as any,
        "_httpGet",
      );

      httpGetStub.resolves(null);

      const result = await service.fetchPreview("https://badsite.com");

      expect(result).to.be.null;
    });
  });

  describe("getPreviewsForContent", () => {
    it("should return previews for URLs in text", async () => {
      const cached = {
        url: "https://example.com",
        title: "Example",
        description: "Desc",
        imageUrl: null,
        siteName: null,
        fetchedAt: new Date(),
      };

      (repo as any).findByUrl.resolves(cached);

      const result = await service.getPreviewsForContent(
        "Check https://example.com",
      );

      expect(result).to.have.length(1);
      expect(result[0].url).to.equal("https://example.com");
    });

    it("should return empty array when no URLs in content", async () => {
      const result = await service.getPreviewsForContent("No links here");

      expect(result).to.be.an("array").that.is.empty;
    });

    it("should limit to 3 URLs maximum", async () => {
      const cached = {
        url: "https://example.com",
        title: "Test",
        description: null,
        imageUrl: null,
        siteName: null,
        fetchedAt: new Date(),
      };

      (repo as any).findByUrl.resolves(cached);

      const text = "https://a.com https://b.com https://c.com https://d.com https://e.com";

      const result = await service.getPreviewsForContent(text);

      // Should process at most 3
      expect(result.length).to.be.at.most(3);
    });
  });
});
