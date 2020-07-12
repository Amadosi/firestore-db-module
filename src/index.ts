const Firestore = require('@google-cloud/firestore');
const cache = require('memory-cache');

export default class DatabaseModule {
  private project_id: string;
  private cache_max_age: number;
  private cache_allocated_memory: number;
  private db: any;

  /**
   * Creates a new DatabaseModule instance.
   * @param {string} project_id
   * @param {number} cache_max_age
   * @param {number} cache_allocated_memory
   */
  constructor({
    project_id,
    cache_max_age = 3600,
    cache_allocated_memory = 64,
  }: {
    project_id: string;
    cache_max_age: number;
    cache_allocated_memory: number;
  }) {
    this.project_id = project_id;
    this.cache_max_age = cache_max_age;
    this.cache_allocated_memory = cache_allocated_memory;

    this.db = new Firestore({
      projectId: this.project_id,
    });
  }

  /**
   * Write a new document to the firestore collection
   * @param {object} creator - The request object containing collection and id.
   * @param {object} document - Object containing the document data to be created.
   *
   */
  async write<T extends DocumentObject>(
    creator: CollectionObject<T>,
    document: T,
  ) {
    if (
      creator.id === undefined ||
      creator.collection === undefined ||
      document === undefined
    ) {
      this.generateError('Incorrect input, all values are required');
    }

    if (
      typeof creator.id !== 'string' ||
      typeof creator.collection !== 'string'
    ) {
      this.generateError(
        `Expected collection of type string and id of type string but got collection of type ${typeof creator.collection} and id of type ${typeof creator.id}`,
      );
    }

    const docRef = this.db.collection(creator.collection).doc(creator.id);

    await docRef.set(document);

    //save to the cache as string using the collection:id query
    this.addToCache(
      `${creator.collection}:${creator.id}`,
      JSON.stringify(document),
    );
  }

  /**
   * Retrieve one document from the collection via its ID
   * @param {object} target - The request object containing collection and id.
   *
   * @returns {object} An object containing the retrieved document data
   */
  async readOne<T>(target: CollectionObject<T>) {
    if (target.id === undefined || target.collection === undefined) {
      this.generateError('Incorrect input, all values are required');
    }

    if (
      typeof target.id !== 'string' ||
      typeof target.collection !== 'string'
    ) {
      this.generateError(
        `Expected collection of type string and id of type string but got collection of type ${typeof target.collection} and id of type ${typeof target.id}`,
      );
    }

    //check if data for the collection:id query exists
    const cached = cache.get(`${target.collection}:${target.id}`);

    if (cached) {
      //parse the string value to json and return
      return <T>JSON.parse(cached);
    }

    const document = await this.db
      .collection(target.collection)
      .doc(target.id)
      .get();

    //throw if document doesn't exist
    if (!document.exists) {
      this.generateError('No such document');
    }

    //save to the cache as string using the collection:id query
    this.addToCache(
      `${target.collection}:${target.id}`,
      JSON.stringify(document.data()),
    );
    return <T>document.data();
  }

  /**
   * Write a new document to the firestore collection
   * @param {object} target - The request object containing collection.
   * @param {object} filter - Optional object used to filter retrieved data
   *
   */
  async readMany<T extends DocumentObject>(
    target: Partial<CollectionObject<T>>,
    filter?: Partial<T>,
  ) {
    if (target.collection === undefined) {
      this.generateError('Incorrect input, collection name not provided');
    }

    if (typeof target.collection !== 'string') {
      this.generateError(
        `Expected collection of type string but got collection of type ${typeof target.collection}`,
      );
    }

    if (target.limit !== undefined && typeof target.limit !== 'number') {
      this.generateError(
        `Expected limit of type number but got limit of type ${typeof target.limit}`,
      );
    }

    //initiate a cacheQueryString construct. if limit isn't provided set 0
    let cacheQuery: string = `${target.collection}:${target.limit || 0}`;

    if (filter !== undefined) {
      for (let key in filter) {
        //create cache query string from the filters key:value
        cacheQuery += `-${key}:${filter[key]}`;
      }
    }

    //check if data for the collection-filters? query exists
    const cached = cache.get(cacheQuery);

    if (cached) {
      //parse the string value to json and return
      return <T[]>JSON.parse(cached);
    }

    let query = this.db.collection(target.collection);

    if (filter !== undefined) {
      for (let key in filter) {
        //append a where call for each data in the filter the filter
        query = query.where(key, '==', filter[key]);
      }
    }

    //set the query limit if limit available
    if (target.limit !== undefined) {
      query = query.limit(target.limit);
    }

    const documents = await query.get();

    let data: T[] = [];

    documents.forEach((doc: DataObject<T>) => data.push(<T>doc.data()));

    //save to cache
    await this.addToCache(cacheQuery, JSON.stringify(data));

    return data;
  }

  /**
   * Updates a single documents record form a collection
   * @param {object} creator - The request object containing collection and id.
   * @param {object} document - Object containing the document data to be updated.
   *
   */
  async updateOne<T extends DocumentObject>(
    creator: CollectionObject<T>,
    document: T,
  ) {
    if (
      creator.id === undefined ||
      creator.collection === undefined ||
      document === undefined
    ) {
      this.generateError('Incorrect input, all values are required');
    }

    if (
      typeof creator.id !== 'string' ||
      typeof creator.collection !== 'string'
    ) {
      this.generateError(
        `Expected collection of type string and id of type string but got collection of type ${typeof creator.collection} and id of type ${typeof creator.id}`,
      );
    }

    const docRef = this.db.collection(creator.collection).doc(creator.id);

    //update the document
    await docRef.update(document);

    //get the newly updated document
    const updatedDoc = await this.db
      .collection(creator.collection)
      .doc(creator.id)
      .get();

    //save to the cache as string using the collection:id query
    this.addToCache(
      `${creator.collection}:${creator.id}`,
      JSON.stringify(updatedDoc.data()),
    );

    return <T>updatedDoc.data();
  }

  async addToCache(key: string, value: string) {
    //get the cache size in bytes
    const size = Buffer.byteLength(cache.exportJson());

    //convert the memory allocated size to bytes
    const maxBytes = this.cache_allocated_memory / 0.000001;


    console.log(size, maxBytes);

    if (maxBytes < size) {
      //clear the cache
      cache.clear();
    }

    //save to the cache as string using the collection:id query
    cache.put(key, value, this.cache_max_age);
  }

  /**
   * Used to throw an error
   * @param {string} error - The error message to be generated.
   *
   */
  generateError(error: string) {
    throw new Error(error);
  }
}
