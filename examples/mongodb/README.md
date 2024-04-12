
# RAG Based Chat-bot using Langchain and MongoDB Atlas
This starter template implements a Retrieval-Augmented Generation (RAG) chatbot using LangChain and MongoDB Atlas. RAG combines AI language generation with knowledge retrieval for more informative responses. LangChain simplifies building the chatbot logic, while MongoDB Atlas' Vector database capability provides a powerful platform for storing and searching the knowledge base that fuels the chatbot's responses.

## Setup 
### Prerequisites

Before you begin, make sure you have the following ready:

- **MongoDB Atlas URI**: Setup your account if you don't already have one ([Create Account](https://www.mongodb.com/docs/guides/atlas/account/))
    
- **OpenAI API Key** (https://platform.openai.com/api-keys)



## Steps to Deploy 
Follow the below-mentioned steps to deploy the app on Vercel.

#### Step 1: Click the below button to navigate to the Vercel deployment page
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FutsavMongoDB%2FMongoDB-RAG-NextJS&env=OPENAI_API_KEY,MONGODB_URI&demo-title=RAG%20with%20MongoDB%20Atlas%20and%20OpenAI&demo-url=https%3A%2F%2Fmonogodb-rag.vercel.app%2F)

#### Step 2: Add Environment Variables

Populate the values of the ENV variables mentioned below

````
OPENAI_API_KEY = "<YOUR_OPENAI_KEY>"              # API Key copied from the OpenAI portal
MONGODB_URI = "<YOUR_MONGODB_URI>"                # Connection URI to MongoDB Instance
````

#### Step 3: Deploy
Once you have updated the above values, go ahead and click deploy to deploy the app. Wait for the app to be deployed and start serving traffic.


#### Step 4: Upload PDF files to create chunks
Head to the `Train` tab and upload a PDF document. 

If everything is deployed correctly, your document should start uploading to your cluster under the `chatter > training_data` collection.

Your data should now start appearing as below in the collection.

![image](https://github.com/utsavMongoDB/vercel/assets/114057324/fbe76a2a-1a63-46bd-9964-8f26f2fb0a60)



#### Step 5: Create Vector Index on Atlas
Now for the RAG (QnA) to work, you need to create a Vector Search Index on Atlas so the vector data can be fetched and served to LLMs.

Create a search index as below.

- Let’s head over to our MongoDB Atlas user interface to create our Vector Search Index. First, click on the “Search” tab and then on “Create Search Index.” You’ll be taken to this page (shown below). Please click on “JSON Editor.”
 ![image](https://github.com/utsavMongoDB/vercel/assets/114057324/b676e95f-3586-460a-8835-cbc468d5334b)

- Next input the values as shown in the below image and create the Vector.
  ![image](https://github.com/utsavMongoDB/vercel/assets/114057324/b082129d-da4b-4085-b263-f3fb13062a1f)

- You should start seeing a vector index getting created. You should get an email once index creation is completed.
  ![image](https://github.com/utsavMongoDB/vercel/assets/114057324/fc8e466b-b051-4ba2-91fb-5571d8ff28b4)

- Once completed, head to the QnA section to start asking questions based on your trained data, and you should get the desired response.

  ![image](https://github.com/utsavMongoDB/vercel/assets/114057324/8d5b4513-e23a-407f-afb6-d1db3193296f)



## Reference Architechture 

![image](https://github.com/utsavMongoDB/vercel/assets/114057324/ef57d050-1996-48cd-ab32-5130cc228e29)



This architecture depicts a Retrieval-Augmented Generation (RAG) chatbot system built with LangChain, OpenAI, and MongoDB Atlas Vector Search. Let's break down its key players:

- **PDF File**: This serves as the knowledge base, containing the information the chatbot draws from to answer questions. The RAG system extracts and processes this data to fuel the chatbot's responses.
- **Text Chunks**: These are meticulously crafted segments extracted from the PDF. By dividing the document into smaller, targeted pieces, the system can efficiently search and retrieve the most relevant information for specific user queries.
- **LangChain**: This acts as the central control unit, coordinating the flow of information between the chatbot and the other components. It preprocesses user queries, selects the most appropriate text chunks based on relevance, and feeds them to OpenAI for response generation.
- **Query Prompt**: This signifies the user's question or input that the chatbot needs to respond to.
- **Actor**: This component acts as the trigger, initiating the retrieval and generation process based on the user query. It instructs LangChain and OpenAI to work together to retrieve relevant information and formulate a response.
- **OpenAI Embeddings**: OpenAI, a powerful large language model (LLM), takes centre stage in response generation. By processing the retrieved text chunks (potentially converted into numerical representations or embeddings), OpenAI crafts a response that aligns with the user's query and leverages the retrieved knowledge.
- **MongoDB Atlas Vector Store**: This specialized database is optimized for storing and searching vector embeddings. It efficiently retrieves the most relevant text chunks from the knowledge base based on the query prompt's embedding. These retrieved knowledge nuggets are then fed to OpenAI to inform its response generation.


This RAG-based architecture seamlessly integrates retrieval and generation. It retrieves the most relevant knowledge from the database and utilizes OpenAI's language processing capabilities to deliver informative and insightful answers to user queries.


## Implementation 

The below components are used to build up the bot, which can retrieve the required information from the vector store, feed it to the chain and stream responses to the client.

#### LLM Model 

        const model = new ChatOpenAI({
            temperature: 0.8,
            streaming: true,
            callbacks: [handlers],
        });


#### MongoDB Vector Store

        const retriever = vectorStore().asRetriever({ 
            "searchType": "mmr", 
            "searchKwargs": { "fetchK": 10, "lambda": 0.25 } 
        })

#### Chain

       const conversationChain = ConversationalRetrievalQAChain.fromLLM(model, retriever, {
            memory: new BufferMemory({
              memoryKey: "chat_history",
            }),
          })
        conversationChain.invoke({
            "question": question
        })
