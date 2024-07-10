import heic2any from "heic2any"
import { debounce } from "lodash-es"

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_end",
  async main() {
    console.log("Hello View HEIC.")

    replaceAllHEICImages()
    observeAllHEICImages()
  },
})

async function convertHEICToPNG(blob: Blob): Promise<Blob> {
  const result = await heic2any({
    blob,
    toType: "image/png",
  })
  return result as Blob
}

function createTestImageElement() {
  const image = document.createElement("img")
  image.src = "https://image.xyzcdn.net/FkEDcsm4zhLvM_08C69YAuDrzZaq.HEIC"
  return image
}

function injectTestImage() {
  document.body.appendChild(createTestImageElement())
}

async function replaceAllHEICImages() {
  const images = document.querySelectorAll<HTMLImageElement>('img[src$=".HEIC"], img[src$=".heic"]')
  // console.log("replace all heic images", images)
  for (const img of images) {
    try {
      const response = await fetch(img.src)
      const arrayBuffer = await response.arrayBuffer()
      const blob = new Blob([arrayBuffer], { type: "image/heic" })
      const convertedBlob = await convertHEICToPNG(blob)
      const objectURL = URL.createObjectURL(convertedBlob)
      img.src = objectURL
    } catch (error) {
      console.error("Error converting HEIC image:", error)
    }
  }
}

function observeAllHEICImages() {
  const debouncedReplaceAllHEICImages = debounce(replaceAllHEICImages, 500, {
    trailing: true,
    leading: false,
  })
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        debouncedReplaceAllHEICImages()
      }
    })
  })
  observer.observe(document.body, {
    childList: true,
    attributes: true,
    subtree: true,
  })
}
