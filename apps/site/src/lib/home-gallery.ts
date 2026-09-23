/** The site renders approved media from the published snapshot, in CMS order. */
export type HomeGalleryStyle = "photos" | "film";

type GallerySnapshot = {
  mode: "preview" | "production";
  homeGallery?: {
    style: HomeGalleryStyle;
    photos: { imageId: string; alt?: string }[];
  };
};

type GalleryMedia = {
  filename: string;
  alt: string;
  width: number;
  height: number;
};

export type HomeGalleryImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
  placeholder: boolean;
};

const previewImages: HomeGalleryImage[] = Array.from({ length: 6 }, (_, i) => ({
  src: `/gallery/placeholder-${String(i + 1).padStart(2, "0")}.svg`,
  alt: `待替换照片 ${i + 1}`,
  width: 720,
  height: 480,
  placeholder: true,
}));

export function resolveHomeGallery(
  snapshot: GallerySnapshot,
  mediaById: (id: string) => GalleryMedia | undefined,
  preview = snapshot.mode === "preview",
): { style: HomeGalleryStyle; images: HomeGalleryImage[] } {
  const style = snapshot.homeGallery?.style === "film" ? "film" : "photos";
  const images = (snapshot.homeGallery?.photos ?? []).flatMap((photo) => {
    const media = mediaById(photo.imageId);
    return media
      ? [
          {
            src: `/media/${media.filename}`,
            alt: photo.alt?.trim() || media.alt,
            width: media.width,
            height: media.height,
            placeholder: false,
          },
        ]
      : [];
  });
  return {
    style,
    images: images.length || !preview ? images : previewImages,
  };
}
