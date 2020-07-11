interface DocumentObject {
  [thingName: string]: string | number | boolean | string[];
}

interface DataObject<T> {
  id: string;
  data: () => T;
}

interface CollectionObject<T> {
  collection: String;
  id: String;
  limit?: number;
}
