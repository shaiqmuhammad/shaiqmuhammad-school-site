export type GalleryItem = {
  id: string;
  title: string;
  category: string;
  imageSeed: number;
  width: number;
  height: number;
};

export const galleryItems: GalleryItem[] = [
  { id: "1", title: "Morning assembly", category: "Campus", imageSeed: 301, width: 800, height: 600 },
  { id: "2", title: "Science lab enquiry", category: "Academics", imageSeed: 302, width: 800, height: 600 },
  { id: "3", title: "Library quiet hour", category: "Campus", imageSeed: 303, width: 800, height: 600 },
  { id: "4", title: "Football fixtures", category: "Sport", imageSeed: 304, width: 800, height: 600 },
  { id: "5", title: "Art studio", category: "Arts", imageSeed: 305, width: 800, height: 600 },
  { id: "6", title: "Early Years outdoor play", category: "Early Years", imageSeed: 306, width: 800, height: 600 },
  { id: "7", title: "Music rehearsal", category: "Arts", imageSeed: 307, width: 800, height: 600 },
  { id: "8", title: "STEM Fair exhibits", category: "Academics", imageSeed: 308, width: 800, height: 600 },
  { id: "9", title: "Graduation day", category: "Community", imageSeed: 309, width: 800, height: 600 },
  { id: "10", title: "School transport", category: "Campus", imageSeed: 310, width: 800, height: 600 },
  { id: "11", title: "Reading buddies", category: "Academics", imageSeed: 311, width: 800, height: 600 },
  { id: "12", title: "Sports day", category: "Sport", imageSeed: 312, width: 800, height: 600 },
];
